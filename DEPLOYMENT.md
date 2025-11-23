# Deployment Guide

## 📦 Quick Deploy Checklist

### Prerequisites
- [ ] GitHub account
- [ ] MongoDB database (local or MongoDB Atlas)
- [ ] Node.js 18+ installed
- [ ] Git installed

### Deployment Steps

## 1. Clone Repository

```bash
git clone https://github.com/firesiderob/rvscraper.git
cd rvscraper
```

## 2. Backend Setup

```bash
cd backend
npm install
```

Create `.env` file:
```bash
PORT=5000
MONGO_URI=mongodb://localhost:27017/fireside-leads
JWT_SECRET=your_super_secret_jwt_key_change_this
NODE_ENV=production

# Email (if using campaigns)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Optional: Data Axle
# DATA_AXLE_API_KEY=your_key
# DATA_AXLE_API_SECRET=your_secret
```

## 3. Frontend Setup

```bash
cd ../frontend
npm install
```

Update API endpoint in `src/services/api.js` if needed:
```javascript
const API_URL = process.env.VITE_API_URL || 'http://localhost:5000/api';
```

## 4. Production Build

**Backend:**
```bash
cd backend
npm start  #  Or use PM2 (recommended)
```

**Frontend:**
```bash
cd frontend
npm run build

# Serve the dist folder with nginx or serve
npx serve -s dist -p 3000
```

## 5. Process Manager (Recommended)

Use PM2 to keep backend running:

```bash
npm install -g pm2

# Start backend
cd backend
pm2 start src/server.js --name rvscraper-api

# Auto-restart on reboot
pm2 startup
pm2 save
```

## 🚀 Deployment Options

### Option A: VPS (DigitalOcean, Linode, AWS EC2)

1. **Provision server** (Ubuntu 22.04 recommended)
2. **Install dependencies:**
```bash
sudo apt update
sudo apt install nodejs npm mongodb nginx

# Or use MongoDB Atlas (cloud)
```

3. **Clone and setup** (steps above)

4. **Configure nginx** as reverse proxy:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend
    location / {
        root /path/to/rvscraper/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

5. **SSL with Let's Encrypt:**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### Option B: Heroku

**Backend:**
```bash
cd backend
heroku create rvscraper-api
heroku addons:create mongolab:sandbox
git push heroku main
```

Set environment variables:
```bash
heroku config:set JWT_SECRET=your_secret
heroku config:set NODE_ENV=production
```

**Frontend:**
Update API URL to Heroku backend, then:
```bash
cd frontend
# Deploy to Netlify, Vercel, or Heroku
```

### Option C: Docker

Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "5000:5000"
    environment:
      - MONGO_URI=mongodb://mongo:27017/fireside-leads
    depends_on:
      - mongo
  
  frontend:
    build: ./frontend
    ports:
      - "3000:80"
  
  mongo:
    image: mongo:latest
    volumes:
      - mongo-data:/data/db

volumes:
  mongo-data:
```

Then:
```bash
docker-compose up -d
```

## 🔐 Security Checklist

- [ ] Change default JWT_SECRET
- [ ] Change default admin password
- [ ] Enable HTTPS (SSL certificate)
- [ ] Set up firewall (ufw or security groups)
- [ ] Whitelist MongoDB IPs
- [ ] Add rate limiting
- [ ] Enable CORS only for your domain
- [ ] Regular backups

## 📊 Monitoring

### PM2 Monitoring
```bash
pm2 monit
pm2 logs rvscraper-api
```

### Database Backups
```bash
# MongoDB backup
mongodump --uri="mongodb://localhost:27017/fireside-leads" --out backup/

# Restore
mongorestore --uri="mongodb://localhost:27017/fireside-leads" backup/fireside-leads/
```

## 🔄 Updates

```bash
cd rvscraper
git pull origin main

cd backend
npm install
pm2 restart rvscraper-api

cd ../frontend
npm install
npm run build
```

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check logs
pm2 logs rvscraper-api

# Common issues:
# - MongoDB not running
# - Port 5000 already in use
# - Missing .env file
```

### Frontend 404 errors
- Check nginx configuration
- Ensure `try_files` includes `/index.html`
- Run `npm run build` after code changes

### Scraper errors
- Website structure changed (update selectors)
- IP blocked (use proxies)
- Rate limiting (add delays)

## 📈 Scaling

### Horizontal Scaling
- Run multiple backend instances behind nginx load balancer
- Use MongoDB replica set
- Separate scraper workers from API servers

### Performance Optimization
- Enable gzip in nginx
- Use CDN for frontend (Cloudflare)
- Cache API responses (Redis)
- Database indexing

## 💰 Cost Estimate

**Small Deployment:**
- VPS: $5-10/month (DigitalOcean Droplet)
- MongoDB Atlas: Free tier (0.5GB)
- Domain: $10-15/year
- SSL: Free (Let's Encrypt)
**Total: ~$5-10/month**

**Medium Deployment:**
- VPS: $20-40/month (2GB RAM)
- MongoDB Atlas: $9-25/month
- Domain + SSL: Included above
**Total: ~$30-65/month**

---

## 🚀 One-Line Deploy (Development)

```bash
git clone https://github.com/firesiderob/rvscraper.git && cd rvscraper && cd backend && npm install && cd ../frontend && npm install && echo "Setup complete! Run 'npm run dev' in backend and frontend folders"
```

---

## Support

For deployment help, open an issue on GitHub or contact support.
