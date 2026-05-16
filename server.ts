import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0'
  ];

  const ROBLOX_DOMAINS = [
    'users.roblox.com',
    'thumbnails.roblox.com',
    'www.roblox.com',
    'groups.roblox.com',
    'economy.roblox.com',
    'inventory.roblox.com',
    'api.roblox.com',
    'roblox.com'
  ];

  const getProxyUrl = (url: string) => {
    let proxiedUrl = url;
    for (const domain of ROBLOX_DOMAINS) {
      if (proxiedUrl.includes(domain)) {
        proxiedUrl = proxiedUrl.replace(domain, domain.replace('roblox.com', 'roproxy.com'));
        break;
      }
    }
    return proxiedUrl;
  };

  const getHeaders = () => {
    return {
      'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://www.roblox.com',
      'Referer': 'https://www.roblox.com/',
      'Cache-Control': 'no-cache',
      'X-Requested-With': 'XMLHttpRequest'
    };
  };

  const fetchWithRetry = async (url: string, options: any, timeout = 3000): Promise<Response | null> => {
    // Try RoProxy first (Primary)
    try {
      const proxyUrl = getProxyUrl(url);
      const res = await fetch(proxyUrl, { 
        ...options, 
        headers: { ...getHeaders(), ...(options.headers || {}) },
        signal: AbortSignal.timeout(timeout) 
      });
      if (res.ok) {
        console.log(`[PROXY] RoProxy Success: ${url}`);
        return res;
      }
    } catch (e) {
      console.warn(`[PROXY] RoProxy failed for ${url}`);
    }

    // Try direct fetch as last resort
    try {
      const res = await fetch(url, {
        ...options,
        headers: { ...getHeaders(), ...(options.headers || {}) },
        signal: AbortSignal.timeout(1000)
      });
      if (res.ok) return res;
    } catch (e) {}

    return null;
  };

  const searchCache = new Map<string, { data: any, timestamp: number }>();
  const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

  // Performance optimized fetch
  const fastFetch = async (url: string, options: any = {}, timeout = 8000) => {
    return fetchWithRetry(url, options, timeout);
  };

  // API Route: Search Roblox Usernames
  app.get("/api/search-roblox", async (req, res) => {
    const q = (req.query.q as string || "").trim().toLowerCase();
    if (!q || q.length < 1) return res.json([]);

    const cached = searchCache.get(q);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json(cached.data);
    }
    
    try {
      const results: any[] = [];
      const seenIds = new Set<string>();
      const seenUsernames = new Set<string>();

      // Parallelize all search methods for maximum coverage
      const searchPromises = [
        (async () => {
          if (q.includes(" ") || q.length < 2) return null;
          // Strategy 1: Check by exact username
          const r = await fastFetch(`https://users.roblox.com/v1/users/get-by-username?username=${encodeURIComponent(q)}`);
          return r?.ok ? r.json() : null;
        })(),
        (async () => {
          // Strategy 2: Keyword search
          const r = await fastFetch(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(q)}&limit=30`);
          return r?.ok ? r.json() : null;
        })(),
        (async () => {
          if (q.includes(" ") || q.length < 2) return null;
          // Strategy 3: Direct Usernames Lookup (Batch API)
          const r = await fastFetch(`https://users.roblox.com/v1/usernames/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [q], excludeBannedUsers: true })
          });
          return r?.ok ? r.json() : null;
        })(),
        (async () => {
          if (q.length < 2) return null;
          // Strategy 4: Profile Page HEAD Check (Fallback if APIs fail but user exists)
          const r = await fastFetch(`https://www.roblox.com/users/profile?username=${encodeURIComponent(q)}`, { method: 'HEAD' });
          if (r?.ok) {
            // Profile exists, but we don't have ID yet. We'll try to find it via user search.
            return null;
          }
          return null;
        })(),
        (async () => {
          // Strategy 5: Direct ID Lookup if query is numeric
          if (!/^\d+$/.test(q)) return null;
          const r = await fastFetch(`https://users.roblox.com/v1/users/${q}`);
          return r?.ok ? r.json() : null;
        })()
      ];

      await Promise.allSettled(searchPromises).then(settledResults => {
        settledResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            const data = result.value;
            // Handle both single objects and list-style responses
            if (data.id) {
              const lowName = (data.name || "").toLowerCase();
              if (!seenIds.has(data.id.toString()) && !seenUsernames.has(lowName)) { 
                results.push(data); 
                seenIds.add(data.id.toString()); 
                seenUsernames.add(lowName);
              }
            } else if (data.data) {
              for (const u of data.data) {
                const lowName = (u.name || "").toLowerCase();
                if (!seenIds.has(u.id.toString()) && !seenUsernames.has(lowName)) { 
                  results.push(u); 
                  seenIds.add(u.id.toString()); 
                  seenUsernames.add(lowName);
                }
              }
            }
          }
        });
      });

      if (results.length === 0) return res.json([]);

      // Batch Thumbnail Fetch
      let mappedResults = [];
      const topResults = results.slice(0, 40);
      const userIdsList = topResults.map(u => u.id).join(",");
      
      let thumbData = { data: [] };
      if (userIdsList) {
        try {
          const thumbRes = await fastFetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userIdsList}&size=150x150&format=Png&isCircular=false`, {}, 4000);
          if (thumbRes?.ok) thumbData = await thumbRes.json();
        } catch (e) {
          console.warn("[THUMBNAIL] Fetch failed, using fallbacks");
        }
      }

      mappedResults = topResults.map(u => {
        const thumb = Array.isArray(thumbData.data) ? thumbData.data.find((t: any) => t.targetId.toString() === u.id.toString()) : null;
        return {
          display: u.displayName || u.name || "Unknown",
          username: u.name || "unknown",
          avatarUrl: thumb?.imageUrl || null,
          avatarLetter: (u.displayName || u.name || "U").charAt(0).toUpperCase()
        };
      });

      if (mappedResults.length > 0) {
        searchCache.set(q, { data: mappedResults, timestamp: Date.now() });
      }
      res.json(mappedResults);
    } catch (error) {
      console.error("[ROBLOX SEARCH] Error:", error);
      res.json([]);
    }
  });

  // API Route: Send Robux (Simulated)
  app.post("/api/send-robux", (req, res) => {
    const { from, to, amount } = req.body;
    console.log(`[BACKEND] ${amount} Robux sent from @${from} to @${to}`);
    res.json({ success: true, message: `Successfully sent ${amount} Robux!` });
  });

  // API Route: Admin Authentication
  app.post("/api/admin-login", (req, res) => {
    const { username, password } = req.body;
    
    // Use Environment Variables if present, otherwise fallback to defaults
    const adminUser = process.env.VITE_ADMIN_USER || "rattpoor";
    const adminPass = process.env.VITE_ADMIN_PASS || "09094344916755";

    if (username === adminUser && password === adminPass) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, error: "Invalid credentials." });
    }
  });

  // API Route: Log Access to Discord
  app.post("/api/log-access", async (req, res) => {
    const { key, ip, status, msg } = req.body;
    const webhookUrl = "https://discord.com/api/webhooks/1501679735456137246/vd3AfrcaoIRVuslVaUJlk6n6jIKBCYlTAEkq74N0QMKNu9oYBEoqaFU4kzW78ocAaao0";
    
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: status === 'success' ? "🔑 Key Verified - Access Granted" : "⚠️ Key Attempt - Access Denied",
            color: status === 'success' ? 0x00BCFF : 0xFF3131,
            description: msg || "No additional info available",
            fields: [
              { name: "Key used", value: `\`\`\`${key}\`\`\``, inline: false },
              { name: "IP Address", value: `\`${ip || 'Unknown'}\``, inline: true },
              { name: "Timestamp", value: new Date().toLocaleString(), inline: true }
            ],
            footer: { text: "SCorbin Security Service • HWID Guard" },
            timestamp: new Date().toISOString()
          }]
        })
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: "Failed to log" });
    }
  });

  // API Route: Fetch Detailed User Profile
  app.get("/api/user-profile/:username", async (req, res) => {
    try {
      const { username } = req.params;
      if (!username) return res.status(400).json({ error: "No username provided" });

      // Search for the user first to get ID
      const userLookupRes = await fetchWithRetry(`https://users.roblox.com/v1/users/get-by-username?username=${encodeURIComponent(username)}`, { headers: getHeaders() });
      const userLookupData: any = await userLookupRes?.json();
      
      const userId = userLookupData?.id;
      if (!userId) {
        return res.json({
          username: username,
          id: null,
          joinedYear: "2024",
          mutualFriends: 0,
          isNewFriend: true
        });
      }

      // Fetch official user data for detailed profile
      const userDetailRes = await fetchWithRetry(`https://users.roblox.com/v1/users/${userId}`, { headers: getHeaders() });
      const userDetailData: any = await userDetailRes?.json();

      let joinedYear = "2024";
      let joinedDate = "2024";
      if (userDetailData?.created) {
        const dateObj = new Date(userDetailData.created);
        joinedYear = dateObj.getFullYear().toString();
        joinedDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}/${dateObj.getFullYear()}`;
      }

      res.json({
        username: username,
        id: userId,
        joinedYear,
        joinedDate,
        mutualFriends: Math.floor(Math.random() * 2), // Still simulated but low
        isNewFriend: Math.random() > 0.8
      });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // API Route: Fetch User Avatar by Username
  app.get("/api/user-avatar/:username", async (req, res) => {
    try {
      const { username } = req.params;
      if (!username || username.length < 2) {
        return res.status(400).json({ error: "Invalid username" });
      }

      // 1. Get User ID from Username
      let userData: any = null;
      try {
        const userRes = await fetchWithRetry(`https://users.roblox.com/v1/users/get-by-username?username=${encodeURIComponent(username)}`, { headers: getHeaders() });
        userData = await userRes?.json();
      } catch (e) {
        console.warn(`[AVATAR] URL lookup failed for ${username}`, e);
      }

      if (!userData || !userData.id) {
        // Fallback: search as keyword and take first
        try {
          const searchRes = await fetchWithRetry(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=1`, { headers: getHeaders() });
          const searchData: any = await searchRes?.json();
          if (searchData?.data && searchData.data[0]) {
            userData = searchData.data[0];
          }
        } catch (e) {
          console.warn(`[AVATAR] Search fallback failed for ${username}`, e);
        }
      }

      if (!userData || !userData.id) {
         return res.status(404).json({ error: "User not found" });
      }

      // 2. Get Avatar Headshot URL
      const thumbRes = await fetchWithRetry(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userData.id}&size=150x150&format=Png&isCircular=false`, { headers: getHeaders() });
      const thumbData: any = await thumbRes?.json();
      const thumbnail = thumbData?.data?.[0];
      
      res.json({
        avatarUrl: thumbnail ? thumbnail.imageUrl : "https://tr.rbxcdn.com/180DAY-40e9f0d0611c6d1d2b0e6e7c10b64ecc/150/150/AvatarHeadshot/Png/noFilter",
        userId: userData.id,
        displayName: userData.displayName || userData.name || username
      });
    } catch (error) {
      console.error("Avatar fetch error:", error);
      res.status(500).json({ error: "Server error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
