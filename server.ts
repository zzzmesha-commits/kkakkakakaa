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

  const getHeaders = () => ({
    'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://www.roblox.com',
    'Referer': 'https://www.roblox.com/',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'RBX-Modern-Browser': 'true'
  });

  const fetchWithRetry = async (url: string, options: any, retries = 2): Promise<Response | null> => {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
            if (res.ok) return res;
            if (res.status === 429) {
                console.warn(`[RATE LIMIT] 429 detected for ${url}. Attempt ${i+1}/${retries}`);
                await new Promise(r => setTimeout(r, 1000 + (Math.random() * 2000)));
                continue;
            }
            return res; 
        } catch (e) {
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    return null;
  };

  const searchCache = new Map<string, { data: any, timestamp: number }>();
  const CACHE_TTL = 1000 * 60 * 15; // 15 minutes

  // API Route: Search Roblox Usernames
  app.get("/api/search-roblox", async (req, res) => {
    const q = (req.query.q as string || "").trim().toLowerCase();
    if (!q || q.length < 1) return res.json([]);

    // Check Cache
    const cached = searchCache.get(q);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`[ROBLOX SEARCH] Serving from cache: "${q}"`);
      return res.json(cached.data);
    }
    
    try {
      const results: any[] = [];
      const seenIds = new Set<string>();

      console.log(`[ROBLOX SEARCH] Query: "${q}"`);

      // 1. Try get-by-username first if it's a likely single username (no spaces)
      if (!q.includes(" ")) {
        try {
          const exactUrl = `https://users.roblox.com/v1/users/get-by-username?username=${encodeURIComponent(q)}`;
          const exactRes = await fetchWithRetry(exactUrl, { headers: getHeaders() });
          if (exactRes?.ok) {
            const exactData: any = await exactRes.json();
            if (exactData && exactData.id && !seenIds.has(exactData.id.toString())) {
              results.push(exactData);
              seenIds.add(exactData.id.toString());
              console.log(`[ROBLOX SEARCH] Exact Match Found: ${exactData.name}`);
            }
          }
        } catch (e) {
          console.warn("[ROBLOX SEARCH] Exact lookup error", e);
        }
      }

      // 2. Try search API 
      try {
        const searchUrl = `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(q)}&limit=100`;
        const searchRes = await fetchWithRetry(searchUrl, { headers: getHeaders() });
        
        if (searchRes?.ok) {
          const searchData: any = await searchRes.json();
          if (searchData.data && Array.isArray(searchData.data)) {
            for (const u of searchData.data) {
              if (!seenIds.has(u.id.toString())) {
                results.push(u);
                seenIds.add(u.id.toString());
              }
            }
          }
        }
      } catch (e) {
        console.error("[ROBLOX SEARCH] Standard search exception", e);
      }

      // 3. Fallback: Internal Results API
      if (results.length < 50) {
        try {
          const fallbackUrl = `https://www.roblox.com/search/users/results?keyword=${encodeURIComponent(q)}&maxRows=100&startIndex=0`;
          const fallbackRes = await fetchWithRetry(fallbackUrl, { headers: getHeaders() });
          if (fallbackRes?.ok) {
            const fallbackData: any = await fallbackRes.json();
            if (fallbackData.UserSearchResults && Array.isArray(fallbackData.UserSearchResults)) {
              for (const u of fallbackData.UserSearchResults) {
                if (!seenIds.has(u.UserId.toString())) {
                  results.push({
                    id: u.UserId,
                    name: u.Name,
                    displayName: u.DisplayName || u.Name
                  });
                  seenIds.add(u.UserId.toString());
                }
              }
            }
          }
        } catch (e) {
          console.warn("[ROBLOX SEARCH] Internal fallback error", e);
        }
      }

      if (results.length === 0) {
        console.log(`[ROBLOX SEARCH] No results found for "${q}" after all attempts`);
        return res.json([]);
      }

      // 4. Fetch Thumbnails (Batch)
      const userIds = results.slice(0, 100).map((u: any) => u.id).join(",");
      let thumbData: any = { data: [] };
      try {
        const thumbUrl = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userIds}&size=150x150&format=Png&isCircular=false`;
        const thumbRes = await fetchWithRetry(thumbUrl, { headers: getHeaders() });
        if (thumbRes?.ok) {
          thumbData = await thumbRes.json();
        }
      } catch (e) {
        console.warn("[ROBLOX SEARCH] Thumbnail fetch failed", e);
      }

      // 5. Map Results safely
      const mappedResults = results.map((u: any) => {
        const thumb = Array.isArray(thumbData.data) ? thumbData.data.find((t: any) => t.targetId === u.id) : null;
        return {
          display: u.displayName || u.name || "Unknown User",
          username: u.name || "unknown",
          avatarUrl: thumb ? thumb.imageUrl : null,
          avatarLetter: (u.displayName || u.name || "U").charAt(0).toUpperCase()
        };
      });

      // Save to Cache
      searchCache.set(q, { data: mappedResults, timestamp: Date.now() });
      if (searchCache.size > 500) {
        const firstKey = searchCache.keys().next().value;
        if (firstKey) searchCache.delete(firstKey);
      }

      console.log(`[ROBLOX SEARCH] Returning ${mappedResults.length} results`);
      res.json(mappedResults);
    } catch (error) {
      console.error("[ROBLOX SEARCH] Final catch-all Error:", error);
      res.status(500).json({ error: "Search failed" });
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
