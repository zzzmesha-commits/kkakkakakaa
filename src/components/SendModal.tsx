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

type ModalStep = 'friends' | 'twoFactorLoading' | 'twoFactor' | 'selection' | 'confirmation' | 'loading' | 'success';

export default function SendModal({ isOpen, onClose, user, onSend, initialFriend }: SendModalProps) {
  const [step, setStep] = useState<ModalStep>(initialFriend ? 'selection' : 'friends');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(initialFriend || null);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [amount, setAmount] = useState(0);
  const [verificationCode, setVerificationCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);

  useEffect(() => {
    if (step === 'twoFactorLoading') {
      const timer = setTimeout(() => {
        setStep('twoFactor');
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [step]);

  useEffect(() => {
    if (isOpen) {
      if (initialFriend) {
        setSelectedFriend(initialFriend);
        setStep('twoFactor');
      } else {
        setSelectedFriend(null);
        setStep('friends');
      }
      setAmount(0);
      setSearch('');
      setSearchResults([]);
      setIsLoading(false);
      setIsFetchingProfile(false);
      setProfileData(null);
      setVerificationCode('');
      setTrustDevice(false);
    }
  }, [isOpen, initialFriend]);

  const combinedResults = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return user.friends || [];
    
    // Always include local friends that match
    const localMatches = (user.friends || []).filter(f => 
      f.display.toLowerCase().includes(term) || 
      f.username.toLowerCase().includes(term)
    );
    
    // Merge with API results, avoiding duplicates
    const seen = new Set(localMatches.map(f => f.username.toLowerCase()));
    const apiMatches = searchResults.filter(f => !seen.has(f.username.toLowerCase()));
    
    return [...localMatches, ...apiMatches];
  }, [search, searchResults, user.friends]);

  useEffect(() => {
    let isCurrent = true;
    const term = search.trim();

    if (!term) {
      setSearchResults([]);
      setIsLoading(false);
      return;
    }

    if (term.length >= 2) {
      setIsLoading(true);
      // Clear results immediately when starting a new search for a better loading feel
      setSearchResults([]);
    }

    const controller = new AbortController();
    const safetyTimeout = setTimeout(() => {
      if (isCurrent) setIsLoading(false);
    }, 8000); // 8s safety limit

    const timer = setTimeout(async () => {
      if (!isCurrent) return;
      setIsLoading(true);
      
      try {
        const timestamp = new Date().getTime();
        const res = await fetch(`/api/search-roblox?q=${encodeURIComponent(term)}&v=${timestamp}`, {
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        const data = await res.json();
        
        if (isCurrent && Array.isArray(data)) {
          setSearchResults(data || []);
        }
      } catch (e: any) {
        if (isCurrent && e.name !== 'AbortError') {
          console.warn("Search failed, using fallback:", e);
          setSearchResults([]);
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
          clearTimeout(safetyTimeout);
        }
      }
    }, 350);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
      clearTimeout(safetyTimeout);
      controller.abort();
    };
  }, [search]);

  if (!isOpen) return null;

  const resultsEmpty = !combinedResults || combinedResults.length === 0;

  const handleSelectFriend = async (friend: Friend) => {
    setSelectedFriend(friend);
    setIsFetchingProfile(true);
    try {
      const res = await fetch(`/api/user-profile/${encodeURIComponent(friend.username)}`);
      if (res.ok) {
        const data = await res.json();
        setProfileData(data);
      }
      // Ensure a minimum loading time for the "authenticity" feel
      await new Promise(resolve => setTimeout(resolve, 1200));
    } catch (e) {
      console.warn("Failed to fetch detailed profile", e);
    } finally {
      setIsFetchingProfile(false);
      setStep('twoFactorLoading');
    }
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
    setSearch('');
    setSearchResults([]);
    setIsLoading(false);
    setIsFetchingProfile(false);

    if (step === 'success') {
      onClose();
      // Only reset locally instead of full reload, unless needed
      setTimeout(() => {
        setStep('friends');
        setSelectedFriend(null);
        setAmount(0);
        setVerificationCode('');
      }, 300);
      return;
    }
    onClose();
    // Reset after animation
    setTimeout(() => {
      setStep('friends');
      setSelectedFriend(null);
      setAmount(0);
      setVerificationCode('');
      setTrustDevice(false);
      setIsLoading(false);
      setIsFetchingProfile(false);
      setProfileData(null);
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className={`w-full shadow-2xl overflow-hidden flex flex-col ${
          step === 'twoFactor' || step === 'twoFactorLoading'
            ? 'transition-none' 
            : 'transition-all duration-300'
        } ${
          step === 'twoFactor'
            ? 'bg-[#2b2d2f] max-w-[473px] h-[710px] rounded-[10px]' 
            : step === 'twoFactorLoading'
            ? 'bg-[#2b2d2f] max-w-[473px] h-[115px] rounded-[10px]'
            : 'bg-white dark:bg-[#1b1d1f] max-w-[420px] rounded-[32px]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center relative ${step === 'twoFactor' || step === 'twoFactorLoading' ? 'h-[50px] px-6 justify-center border-b border-white/5 bg-[#2b2d2f]' : 'px-6 py-5 justify-between'}`}>
          {step === 'twoFactor' || step === 'twoFactorLoading' ? (
            <>
              <button 
                onClick={handleClose} 
                className="absolute left-4 text-[#f7f7f8] hover:opacity-80 transition-opacity"
                aria-label="Close"
              >
                <X size={24} strokeWidth={2.5} />
              </button>
              <h3 className="text-[17px] font-bold text-white tracking-tight">2-Step Verification</h3>
            </>
          ) : (
            <>
               <div className="flex items-center gap-1.5 pt-0.5">
                 <div className="w-5 h-5 flex items-center justify-center overflow-hidden shrink-0">
                    <img 
                      src="https://media.discordapp.net/attachments/1501019720604844084/1504448680600666233/lXCZhkN64AAAAABJRU5ErkJggg.png?ex=6a0900c4&is=6a07af44&hm=1fb0d30c231caba3c9bdf7df9d977306bb2bb9b289027f1ad40b400baa3ed94d&=&format=webp&quality=lossless" 
                      alt="Robux Logo" 
                      className="w-full h-full object-contain"
                    />
                 </div>
                 <h3 className="text-base font-semibold text-slate-800 dark:text-white tracking-tight">Send Robux</h3>
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
            </>
          )}
        </div>

        <div className={`${step === 'twoFactor' || step === 'twoFactorLoading' ? 'bg-[#2b2d2f] flex-1 overflow-hidden' : 'px-6 pb-6 pt-2'}`}>
          <AnimatePresence mode="wait">
            {step === 'twoFactorLoading' && (
              <div
                key="step-2fa-loading"
                className="flex flex-col items-center justify-center h-full bg-[#2b2d2f]"
              >
                <div className="flex gap-2.5">
                  <motion.div 
                    animate={{ backgroundColor: ["rgba(255,255,255,0.15)", "rgba(255,255,255,0.6)", "rgba(255,255,255,0.15)"] }} 
                    transition={{ duration: 1, repeat: Infinity, times: [0, 0.5, 1] }}
                    className="w-[11px] h-[11px] rounded-[1px]" 
                  />
                  <motion.div 
                    animate={{ backgroundColor: ["rgba(255,255,255,0.15)", "rgba(255,255,255,0.6)", "rgba(255,255,255,0.15)"] }} 
                    transition={{ duration: 1, repeat: Infinity, times: [0, 0.5, 1], delay: 0.2 }}
                    className="w-[11px] h-[11px] rounded-[1px]" 
                  />
                  <motion.div 
                    animate={{ backgroundColor: ["rgba(255,255,255,0.15)", "rgba(255,255,255,0.6)", "rgba(255,255,255,0.15)"] }} 
                    transition={{ duration: 1, repeat: Infinity, times: [0, 0.5, 1], delay: 0.4 }}
                    className="w-[11px] h-[11px] rounded-[1px]" 
                  />
                </div>
              </div>
            )}

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
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-900 border-none rounded-xl text-[13px] focus:ring-0 outline-none transition-all font-medium text-slate-700 dark:text-white dark:placeholder:text-zinc-600"
                  />
                </div>
                
                <div className="max-h-[440px] overflow-y-auto space-y-0.5 scrollbar-hide">
                  {(() => {
                    const seen = new Set();
                    const listItems = combinedResults.map((f) => {
                      if (seen.has(f.username)) return null;
                      seen.add(f.username);
                      return (
                        <button
                          key={f.username}
                          onClick={() => handleSelectFriend(f)}
                          disabled={isFetchingProfile}
                          className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors text-left group disabled:opacity-50"
                        >
                          <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-100 dark:bg-zinc-700 flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-[1.02]">
                            {f.avatarUrl ? (
                              <img src={f.avatarUrl} alt={f.display} className="w-full h-full object-cover" />
                            ) : (
                              <span className="font-bold text-gray-400 dark:text-zinc-500 text-lg">{f.avatarLetter}</span>
                            )}
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <div className="font-bold text-[15px] text-slate-800 dark:text-zinc-100 truncate mb-0.5">{f.display}</div>
                            <div className="text-[13px] text-gray-500 dark:text-zinc-400 truncate font-medium">@{f.username}</div>
                          </div>
                        </button>
                      );
                    }).filter(Boolean);

                    return (
                      <>
                        {listItems}
                        {search.length >= 2 && resultsEmpty && (
                          <div className="py-12 flex flex-col items-center gap-3">
                            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            <div className="text-gray-400 font-bold text-[11px] uppercase tracking-widest animate-pulse">
                              Looking for results...
                            </div>
                          </div>
                        )}
                        {!isLoading && !search && resultsEmpty && (
                          <div className="py-12 text-center text-gray-300 dark:text-zinc-700 font-bold text-sm uppercase tracking-widest">Type to find a friend</div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            )}

            {step === 'twoFactor' && (
              <div
                key="step-2fa"
                className="flex flex-col items-center px-10 pt-10 pb-8 bg-[#2b2d2f] text-center"
              >
                {/* 2FA Shield Icon */}
                <div className="mb-10">
                  <svg width="84" height="98" viewBox="0 0 100 110" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M50 4.5C32 4.5 14 10 10 28V60C10 82 50 106 50 106C50 106 90 82 90 60V28C86 10 68 4.5 50 4.5Z" stroke="#f7f7f8" strokeWidth="5" />
                    <rect x="34" y="52" width="32" height="24" rx="2" stroke="#f7f7f8" strokeWidth="5" />
                    <path d="M40 52V46C40 40 44 36 50 36C56 36 60 40 60 46V52" stroke="#f7f7f8" strokeWidth="5" />
                  </svg>
                </div>

                <div className="max-w-[340px] mb-8">
                  <p className="text-[14.5px] font-normal text-[#f7f7f8] leading-[1.6] mb-4">
                    We want to make sure it's you. Enter the code we sent to your email:
                  </p>
                  <p className="text-[14.5px] font-normal text-[#f7f7f8] tracking-tight">
                    {user.email ? `${user.email.charAt(0)}${'*'.repeat(15)}${user.email.substring(user.email.indexOf('@'))}` : 'k***************@gmail.com'}.
                  </p>
                </div>

                <div className="w-full max-w-[465px] flex flex-col items-center">
                  <div className="w-full mb-6 relative">
                    <input
                      type="password"
                      maxLength={6}
                      value={verificationCode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setVerificationCode(val);
                      }}
                      placeholder="Enter 6-digit Code"
                      className="w-full bg-[#171a1d] border border-white/10 rounded-[6px] py-2.5 px-4 text-[#f7f7f8] text-[15px] font-normal placeholder:text-[#ced0d1] focus:outline-none transition-all shadow-inner"
                    />
                  </div>

                  <div className="flex items-center justify-center mb-10">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <div className="relative flex items-center justify-center">
                        <input 
                          type="checkbox" 
                          className="peer appearance-none w-[18px] h-[18px] border-[1px] border-[#828384] rounded-[1px] bg-transparent checked:bg-zinc-500 checked:border-zinc-500 transition-all cursor-pointer"
                          checked={trustDevice}
                          onChange={() => setTrustDevice(!trustDevice)}
                        />
                        <svg className="absolute w-3 h-3 text-white pointer-events-none hidden peer-checked:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-[14px] font-normal text-[#f7f7f8]">Trust this device for 30 days</span>
                    </label>
                  </div>

                  <div className="flex flex-col items-center gap-2 mb-8">
                    <button className="text-[#f7f7f8] font-bold text-[13px] hover:underline">
                      Resend Code
                    </button>
                    <button className="text-[#f7f7f8] font-bold text-[13px] hover:underline">
                      Use another verification method
                    </button>
                  </div>

                  <button
                    onClick={() => setStep('selection')}
                    className={`w-full py-2.5 rounded-[8px] font-bold text-[16px] transition-all ${verificationCode.length === 6 ? 'bg-white text-[#2b2d2f]' : 'bg-[#828384] text-[#f7f7f8]'} hover:opacity-90`}
                  >
                    Verify
                  </button>

                  <div className="mt-8 space-y-4">
                    <div className="text-[12px] font-normal text-[#f7f7f8]">
                      Need help? Contact <span className="font-bold hover:underline cursor-pointer">Roblox Support</span>
                    </div>
                    <div className="text-[9px] font-normal text-[#828384] leading-[1.4] max-w-[340px] mx-auto uppercase tracking-wide">
                      IMPORTANT: Don't share your security codes with anyone. Roblox will never ask you for your codes. This can include things like texting your code, screensharing, etc.
                    </div>
                  </div>
                </div>
              </div>
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
                    <div className="w-8 h-8 flex items-center justify-center">
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
                    className="w-full bg-blue-500 text-white font-black py-4 rounded-2xl hover:bg-blue-600 transition-all shadow-xl shadow-blue-200 dark:shadow-none disabled:bg-blue-300 disabled:shadow-none"
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
                    className="w-full bg-slate-800 dark:bg-zinc-100 dark:text-zinc-900 text-white font-black py-4 rounded-2xl hover:bg-slate-900 dark:hover:bg-white transition-all shadow-xl shadow-slate-200 dark:shadow-none"
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
                   <div className="flex items-center gap-1.5 mb-1.5">
                     <div className="font-black text-xl text-slate-800 dark:text-white">{selectedFriend?.display}</div>
                   </div>
                   <div className="text-gray-500 dark:text-zinc-400 font-bold text-sm mb-6">@{selectedFriend?.username}</div>
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
                      className="bg-blue-600 text-white font-black py-4 rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 dark:shadow-none"
                    >
                      Send
                    </button>
                    <button
                      onClick={() => setStep('selection')}
                      className="bg-gray-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-black py-4 rounded-2xl hover:bg-gray-300 dark:hover:bg-zinc-700 transition-all font-bold"
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

