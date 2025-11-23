# RV Scraper - Quick Start

## 🚀 One-Command Startup

```bash
cd /Users/robboirun/Documents/GAgents/fireside-lead-gen
./start.sh
```

That's it! This will:
1. ✅ Start backend server
2. ✅ Start ngrok tunnel
3. ✅ Show you the public URL

## 🛑 To Stop

Press `Ctrl+C` in the terminal - this stops both backend and ngrok cleanly.

## 📝 What You'll See

```
🚀 Starting RV Scraper Backend + ngrok...

📦 Starting backend server...
⏳ Waiting for backend to start...
✅ Backend started successfully (PID: 12345)
   Logs: tail -f /tmp/rvscraper-backend.log

🌐 Starting ngrok tunnel...

Session Status: online
Forwarding: https://your-url.ngrok-free.dev -> http://localhost:5000
```

**Copy the ngrok URL** - that's your public backend!

## 🔄 If ngrok URL Changed

If the ngrok URL is different from last time:

1. **Edit:** `frontend/src/services/api.js`
2. **Update line 3** with new URL
3. **Push changes:**
   ```bash
   git add frontend/src/services/api.js
   git commit -m "Update ngrok URL"
   git push
   ```
4. Wait 2 minutes for Vercel to redeploy

## 📊 Check Backend Logs

While running:
```bash
tail -f /tmp/rvscraper-backend.log
```

## 🌐 Access Points

- **Backend (local):** http://localhost:5000/api/health
- **Backend (public):** https://your-ngrok-url.ngrok-free.dev/api/health
- **ngrok Dashboard:** http://localhost:4040
- **Frontend:** Your Vercel URL

## ⚠️ Important

1. **Computer must stay on** for others to use the app
2. **Terminal must stay open** - don't close it!
3. **ngrok URL might change** each restart

## 💡 Tips

### Get a Static ngrok Domain (FREE)

1. Go to https://dashboard.ngrok.com/domains
2. Create a domain (e.g., `rvscraper.ngrok.io`)
3. Edit `start.sh`, change last ngrok line to:
   ```bash
   ngrok http 5000 --domain=rvscraper.ngrok.io
   ```
4. **URL never changes again!**

### Auto-Start on Login (Optional)

Add to your `~/.zshrc` or `~/.bash_profile`:
```bash
alias start-rvscraper="cd /Users/robboirun/Documents/GAgents/fireside-lead-gen && ./start.sh"
```

Then just run: `start-rvscraper`

## 🆘 Troubleshooting

### "Permission denied"
```bash
chmod +x start.sh
```

### "Backend failed to start"
Check logs:
```bash
cat /tmp/rvscraper-backend.log
```

Common issues:
- MongoDB not accessible
- Port 5000 already in use
- Missing node/npm

### "Port 5000 already in use"
Kill the process:
```bash
lsof -ti:5000 | xargs kill -9
./start.sh
```

## 📞 Support

Everything working? You're all set!

Issues? Check:
1. Backend logs: `cat /tmp/rvscraper-backend.log`
2. ngrok dashboard: http://localhost:4040
3. MongoDB Atlas is running
