import { useState, useMemo, useEffect } from 'react';
import { X, Send, Calendar, Users, Info } from 'lucide-react';
import { User, Friend } from '../types';
import RobuxIcon from './RobuxIcon';
import { motion, AnimatePresence } from 'motion/react';

interface SendModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onSend: (amount: number, friend: Friend) => void;
  initialFriend?: Friend | null;
}

type ModalStep = 'friends' | 'selection' | 'confirmation' | 'loading' | 'success';

export default function SendModal({ isOpen, onClose, user, onSend, initialFriend }: SendModalProps) {
  const [step, setStep] = useState<ModalStep>(initialFriend ? 'selection' : 'friends');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(initialFriend || null);
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    if (isOpen) {
      if (initialFriend) {
        setSelectedFriend(initialFriend);
        setStep('selection');
      } else {
        setSelectedFriend(null);
        setStep('friends');
      }
      setAmount(0);
      setSearch('');
      setSearchResults([]);
      setIsLoading(false);
    }
  }, [initialFriend, isOpen]);

  useEffect(() => {
    if (!search) {
      setSearchResults([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/search-roblox?q=${encodeURIComponent(search)}`, {
          signal: controller.signal
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          setSearchResults(data);
        } else {
          setSearchResults([]);
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.error("Search error", e);
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  if (!isOpen) return null;

  const handleSelectFriend = (friend: Friend) => {
    setSelectedFriend(friend);
    setStep('selection');
  };

  const handleConfirmSend = async () => {
    if (selectedFriend && amount > 0 && amount <= user.robux) {
      setStep('loading');
      
      // Reduced delay to prevent "stuck" feeling
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      try {
        await fetch('/api/send-robux', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: user.username, to: selectedFriend.username, amount })
        });
      } catch (e) {
        console.error("Failed to track transaction", e);
      }
      
      onSend(amount, selectedFriend);
      setStep('success');
    }
  };

  const handleClose = () => {
    if (step === 'success') {
      onClose();
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      return;
    }
    onClose();
    // Reset after animation
    setTimeout(() => {
      setStep('friends');
      setSelectedFriend(null);
      setAmount(0);
      setSearch('');
      setSearchResults([]);
      setIsLoading(false);
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white dark:bg-[#1b1d1f] rounded-[32px] w-full max-w-[420px] shadow-2xl overflow-hidden flex flex-col transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5">
          <div className="flex items-center gap-2">
             <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-800 flex items-center justify-center overflow-hidden border border-gray-100 dark:border-zinc-700">
                <img 
                  src="https://media.discordapp.net/attachments/1501019720604844084/1504448680600666233/lXCZhkN64AAAAABJRU5ErkJggg.png?ex=6a070684&is=6a05b504&hm=8797af119cccbd910ec55d2f6db5618742a5a28496db5be0fd90a2b0ee134e7d&=&format=webp&quality=lossless" 
                  alt="Robux Logo" 
                  className="w-full h-full object-contain"
                />
             </div>
             <h3 className="text-xl font-black text-slate-800 dark:text-white">Send Robux</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-zinc-200 mr-1">
               <RobuxIcon className="w-4 h-4 text-slate-700 dark:text-zinc-400" />
               <span className="text-sm">{user.robux.toLocaleString()}</span>
            </div>
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="px-6 pb-6 pt-2">
          <AnimatePresence mode="wait">
            {step === 'friends' && (
              <motion.div
                key="step-friends"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                <div className="relative">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by username"
                    className="w-full px-4 py-3.5 bg-gray-50 dark:bg-zinc-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 transition-all font-medium dark:text-white dark:placeholder:text-zinc-500"
                  />
                  {isLoading && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                
                <div className="max-h-[480px] overflow-y-auto space-y-1 scrollbar-hide">
                  {searchResults.map((f) => (
                    <button
                      key={f.username}
                      onClick={() => handleSelectFriend(f)}
                      className="w-full flex items-center gap-3.5 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors text-left group"
                    >
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 dark:bg-zinc-700 flex items-center justify-center shrink-0 shadow-sm transition-transform group-active:scale-95">
                        {f.avatarUrl ? (
                          <img src={f.avatarUrl} alt={f.display} className="w-full h-full object-cover" />
                        ) : (
                          <span className="font-bold text-gray-400 dark:text-zinc-500">{f.avatarLetter}</span>
                        )}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <div className="font-bold text-sm text-slate-800 dark:text-zinc-100 truncate">{f.display}</div>
                        <div className="text-xs text-gray-500 dark:text-zinc-400 truncate font-medium">@{f.username}</div>
                      </div>
                    </button>
                  ))}
                  {search && !isLoading && searchResults.length === 0 && (
                    <div className="py-12 text-center">
                      <p className="text-gray-400 font-bold text-sm uppercase tracking-widest">No users found</p>
                    </div>
                  )}
                  {!search && (
                    <div className="py-12 text-center">
                      <p className="text-gray-300 dark:text-zinc-600 font-bold text-sm uppercase tracking-widest">Type to find a friend</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {step === 'selection' && (
              <motion.div
                key="step-selection"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center"
              >
                {/* Recipient info */}
                <div className="w-full bg-gray-50/50 dark:bg-zinc-800/30 rounded-3xl p-6 mb-4 flex flex-col items-center border border-transparent dark:border-zinc-800">
                   <div className="w-20 h-20 rounded-full overflow-hidden mb-4 shadow-lg ring-4 ring-white dark:ring-zinc-800">
                      {selectedFriend?.avatarUrl ? (
                        <img src={selectedFriend.avatarUrl} alt={selectedFriend.display} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gray-100 dark:bg-zinc-700 flex items-center justify-center font-black text-2xl text-gray-300 dark:text-zinc-500">
                          {selectedFriend?.avatarLetter}
                        </div>
                      )}
                   </div>
                   <div className="font-black text-xl text-slate-800 dark:text-white">{selectedFriend?.display}</div>
                </div>

                {/* Big Amount Overall Display */}
                 <div className="flex items-center justify-center gap-3 mb-6 mt-4">
                    <div className="w-10 h-10 flex items-center justify-center">
                       <RobuxIcon className="w-full h-full" />
                    </div>
                   <span className="text-4xl font-black text-slate-800 dark:text-white tabular-nums tracking-tighter leading-none">{amount.toLocaleString()}</span>
                 </div>

                {/* Custom Amount Input */}
                <div className="w-full mb-10 px-10">
                  <div className="relative">
                    <input 
                      type="text"
                      value={amount > 0 ? amount.toLocaleString() : ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/,/g, '');
                        if (/^\d*$/.test(val)) {
                          setAmount(Math.max(0, parseInt(val) || 0));
                        }
                      }}
                      placeholder="0"
                      className="w-full bg-transparent border-none text-center py-4 text-4xl font-black text-slate-800 dark:text-white focus:outline-none focus:ring-0 transition-all placeholder:text-gray-100 dark:placeholder:text-zinc-800"
                    />
                  </div>
                  <div className="h-[2px] bg-gray-100 dark:bg-zinc-800 w-full rounded-full" />
                  {amount > user.robux && (
                    <p className="text-red-500 text-[11px] font-black mt-3 text-center uppercase tracking-widest">Balance Exceeded</p>
                  )}
                </div>

                {/* Quick Select */}
                <div className="grid grid-cols-4 gap-2 w-full mb-10">
                   {[25, 50, 100, 200].map(val => (
                     <button
                       key={val}
                       onClick={() => setAmount(val)}
                       className={`flex items-center justify-center gap-1.5 py-3.5 rounded-xl font-bold text-[13px] transition-all ${
                         amount === val 
                           ? 'bg-slate-800 dark:bg-zinc-100 dark:text-zinc-900 text-white' 
                           : 'bg-[#E8EBF2] dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-[#DEE3ED] dark:hover:bg-zinc-700'
                       }`}
                     >
                       <RobuxIcon className={`w-3.5 h-3.5 ${amount === val ? (user.theme === 'dark' ? 'text-zinc-900' : 'text-white') : 'text-slate-500'}`} />
                       {val}
                     </button>
                   ))}
                </div>

                <div className="w-full space-y-4">
                  <button
                    disabled={amount <= 0 || amount > user.robux}
                    onClick={() => setStep('confirmation')}
                    className="w-full bg-blue-500 text-white font-black py-4.5 rounded-2xl hover:bg-blue-600 transition-all shadow-xl shadow-blue-200 dark:shadow-none disabled:bg-blue-300 disabled:shadow-none"
                  >
                    Next
                  </button>
                  <p className="text-[11px] text-gray-400 dark:text-zinc-500 text-center font-bold">
                    Robux are sent instantly with no fees
                  </p>
                </div>
              </motion.div>
            )}

            {step === 'loading' && (
              <motion.div
                key="step-loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center py-12"
              >
                <div className="relative w-24 h-24 mb-6">
                   <div className="absolute inset-0 border-4 border-gray-100 dark:border-zinc-800 rounded-full" />
                   <motion.div 
                     className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent"
                     animate={{ rotate: 360 }}
                     transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                   />
                   <div className="absolute inset-0 flex items-center justify-center">
                      <RobuxIcon className="w-10 h-10 animate-pulse" />
                   </div>
                </div>
                <h3 className="text-xl font-black text-slate-800 dark:text-white animate-pulse">Processing Transfer...</h3>
                <p className="text-sm text-gray-500 dark:text-zinc-400 font-bold mt-2">Checking security protocols</p>
              </motion.div>
            )}

            {step === 'success' && (
              <motion.div
                key="step-success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center py-6"
              >
                <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-green-100 dark:shadow-none transition-colors duration-500">
                   <motion.div
                     initial={{ scale: 0 }}
                     animate={{ scale: 1 }}
                     transition={{ type: "spring", damping: 12 }}
                   >
                     <Send className="text-white w-10 h-10 -mr-1" />
                   </motion.div>
                </div>
                
                <h3 className="text-3xl font-black text-slate-800 dark:text-white mb-2">Success!</h3>
                <div className="text-center bg-gray-50 dark:bg-zinc-800 rounded-2xl p-4 mb-8 w-full border border-transparent dark:border-zinc-700 transition-colors">
                  <p className="text-slate-600 dark:text-zinc-400 font-bold">
                    Sent <span className="text-slate-800 dark:text-zinc-100">{amount.toLocaleString()}</span> Robux to <span className="text-slate-800 dark:text-zinc-100">{selectedFriend?.display}</span>
                  </p>
                </div>

                <div className="w-full space-y-4">
                  <button
                    onClick={handleClose}
                    className="w-full bg-slate-800 dark:bg-zinc-100 dark:text-zinc-900 text-white font-black py-4.5 rounded-2xl hover:bg-slate-900 dark:hover:bg-white transition-all shadow-xl shadow-slate-200 dark:shadow-none"
                  >
                    Close
                  </button>
                  <p className="text-[11px] text-gray-400 dark:text-zinc-500 text-center font-bold uppercase tracking-widest">
                    Transaction ID: {Math.random().toString(36).substring(7).toUpperCase()}
                  </p>
                </div>
              </motion.div>
            )}
            {step === 'confirmation' && (
              <motion.div
                key="step-confirmation"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center"
              >
                {/* Detailed Recipient info */}
                <div className="w-full bg-gray-50 dark:bg-zinc-800 rounded-[32px] p-8 mb-4 flex flex-col items-center text-center transition-colors border border-transparent dark:border-zinc-800">
                   <div className="w-24 h-24 rounded-full overflow-hidden mb-4 shadow-xl ring-4 ring-white dark:ring-zinc-700">
                      {selectedFriend?.avatarUrl ? (
                        <img src={selectedFriend.avatarUrl} alt={selectedFriend.display} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center font-black text-3xl text-gray-300 dark:text-zinc-600">
                          {selectedFriend?.avatarLetter}
                        </div>
                      )}
                   </div>
                   <div className="font-black text-xl text-slate-800 dark:text-white mb-1">{selectedFriend?.display}</div>
                   <div className="text-gray-500 dark:text-zinc-400 font-bold text-sm mb-6">@{selectedFriend?.username}</div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                      <div className="flex items-center gap-2 text-slate-500 dark:text-zinc-400 font-bold text-[13px]">
                         <Calendar size={16} className="text-slate-400 dark:text-zinc-500 shrink-0" />
                         New friend
                      </div>
                      <div className="flex items-center gap-2 text-slate-500 dark:text-zinc-400 font-bold text-[13px]">
                         <Users size={16} className="text-slate-400 dark:text-zinc-500 shrink-0" />
                         1 mutual Friends
                      </div>
                      <div className="flex items-center justify-center md:col-span-2 gap-2 text-slate-500 dark:text-zinc-400 font-bold text-[13px] mt-1">
                         <Info size={16} className="text-slate-400 dark:text-zinc-500 shrink-0" />
                         Joined in 2024
                      </div>
                   </div>
                </div>

                {/* Amount Box */}
                <div className="w-full bg-[#F2F4F7] dark:bg-zinc-800/80 rounded-3xl py-10 mb-6 flex items-center justify-center gap-4 transition-colors">
                   <div className="w-12 h-12 flex items-center justify-center">
                      <RobuxIcon className="w-full h-full" />
                   </div>
                   <span className="text-6xl font-black text-slate-800 dark:text-white tabular-nums tracking-tighter leading-none">{amount.toLocaleString()}</span>
                </div>

                <div className="w-full space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleConfirmSend}
                      className="bg-blue-600 text-white font-black py-4.5 rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 dark:shadow-none"
                    >
                      Send
                    </button>
                    <button
                      onClick={() => setStep('selection')}
                      className="bg-gray-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-black py-4.5 rounded-2xl hover:bg-gray-300 dark:hover:bg-zinc-700 transition-all font-bold"
                    >
                      Edit
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-zinc-500 font-medium leading-tight px-2">
                    You need an age check or parental consent to send Robux. Once you send, you cannot cancel.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

