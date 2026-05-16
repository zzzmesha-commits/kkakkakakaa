import { Friend } from '../types';
import { motion } from 'motion/react';
import { User, ShieldCheck } from 'lucide-react';

interface ProfileResultsProps {
  results: Friend[];
  onSendRobux: (friend: Friend) => void;
  onClose: () => void;
}

export default function ProfileResults({ results, onSendRobux, onClose }: ProfileResultsProps) {
  return (
    <div className="mb-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          Search Results 
          <span className="text-xs font-medium bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
            {results.length} Profiles Found
          </span>
        </h2>
        <button 
          onClick={onClose}
          className="text-sm font-semibold text-gray-400 hover:text-gray-900"
        >
          Clear Results
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(() => {
          const seen = new Set();
          return results.map((profile, i) => {
            if (seen.has(profile.username)) return null;
            seen.add(profile.username);
            return (
              <motion.div
                key={profile.username}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="group relative border border-gray-200 rounded-2xl bg-white p-5 hover:shadow-xl hover:-translate-y-1 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="relative w-20 h-20 rounded-2xl bg-gray-100 overflow-hidden flex-shrink-0 border-2 border-gray-50">
                    {profile.avatarUrl ? (
                      <img 
                        src={profile.avatarUrl} 
                        alt={profile.display} 
                        className="w-full h-full object-cover transition-transform group-hover:scale-110"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.display)}&background=random&color=fff&size=150`;
                          if (target.src !== fallback) {
                            target.src = fallback;
                          }
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 font-bold text-2xl">
                        {profile.avatarLetter}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-lg truncate">{profile.display}</h3>
                      <img 
                        src="https://en.help.roblox.com/hc/article_attachments/41933934939156" 
                        alt="Verified" 
                        className="w-4 h-4 object-contain shrink-0"
                      />
                    </div>
                    <div className="mb-3">
                      <p className="text-sm text-gray-500 truncate">@{profile.username}</p>
                    </div>
                    <button
                      onClick={() => onSendRobux(profile)}
                      className="w-full bg-blue-600 text-white text-xs font-bold py-2 rounded-full hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      Send Robux
                    </button>
                  </div>
                </div>
                <div className="absolute top-4 right-4">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
                </div>
              </motion.div>
            );
          });
        })()}
      </div>
    </div>
  );
}
