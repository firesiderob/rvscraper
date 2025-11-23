# RV Lead Generation Platform

Automated lead generation system for RV businesses and RV owners. Scrapes multiple sources, validates contact information, and provides a dashboard for managing leads.

## 🚀 Features

- **Multi-Source Scraping**
  - Craigslist (60-70% phone contact rate)
  - RVTrader
  - Data Axle (Premium) - 80-85% contact rate
  
- **Intelligent Contact Extraction**
  - Phone number validation & formatting
  - Email quality scoring
  - Seller name identification from text
  
- **Lead Management Dashboard**
  - Search & filter leads
  - Export to CSV
  - Email campaigns
  - Lead status tracking

- **Data Quality**
  - Duplicate detection
  - Contact validation
  - Generic email filtering
  - Demographics tracking (Data Axle)

## 📊 Expected Results

| Source | Phone Rate | Email Rate | Cost | Best For |
|--------|------------|------------|------|----------|
| Craigslist | 60-70% | 30-40% | Free | Daily lead gen |
| Data Axle | 80-85% | 85-90% | $0.08-0.25/lead | Premium campaigns |
| RVTrader | 20-30% | 5-10% | Free | Backup |

## 🛠️ Tech Stack

**Backend:**
- Node.js + Express
- MongoDB (Mongoose)
- Puppeteer (web scraping)

**Frontend:**
- React
- Vite
- CSS

## 📦 Installation

### Prerequisites

- Node.js 18+ and npm
- MongoDB (local or Atlas)
- Git

### Setup

1. **Clone the repository**
```bash
git clone https://github.com/firesiderob/rvscraper.git
cd rvscraper
```

2. **Install backend dependencies**
```bash
cd backend
npm install
```

3. **Install frontend dependencies**
```bash
cd ../frontend
npm install
```

4. **Configure environment variables**

Create `backend/.env`:
```bash
PORT=5000
MONGO_URI=mongodb://localhost:27017/fireside-leads
JWT_SECRET=your_jwt_secret_here

# Optional: Data Axle (for premium leads)
# DATA_AXLE_API_KEY=your_key
# DATA_AXLE_API_SECRET=your_secret
# DATA_AXLE_BASE_URL=https://api.data-axle.com/v1
```

5. **Start MongoDB**
```bash
# If using local MongoDB
mongod
```

6. **Run the application**

Backend:
```bash
cd backend
npm run dev
```

Frontend (new terminal):
```bash
cd frontend
npm run dev
```

7. **Access the dashboard**
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000

## 🔐 Default Login

```
Email: admin@fireside.com
Password: password123
```

**⚠️ Change these in production!**

## 📖 Usage

### RV Owner Search

1. Navigate to **RV Owners** tab
2. Select source:
   - **Craigslist** - Free, good contact rates
   - **Data Axle** - Premium, best quality
   - **RVTrader** - Backup option
3. Enter search criteria (State required)
4. Click "Find RV Owners"
5. Wait ~30-60 seconds for results

### Managing Leads

- **Filter** by source, status, or location
- **Export** to CSV for CRM import
- **Update status** (New → Contacted → Interested)
- **Add notes** for follow-up

### Email Campaigns

1. Go to **Campaigns** tab
2. Create new campaign
3. Select leads by filter
4. Customize email template
5. Send or schedule

## 🔧 Configuration

### Data Axle Setup

Data Axle provides the highest quality RV owner data. To enable:

1. Sign up at https://www.data-axle.com
2. Get API credentials
3. Add to `backend/.env`:
```bash
DATA_AXLE_API_KEY=your_key_here
DATA_AXLE_API_SECRET=your_secret_here
```
4. Restart backend server

**Note:** Without credentials, Data Axle runs in mock mode for testing.

### Customizing Scrapers

Edit scraper files in `backend/src/scrapers/`:
- `craigslistScraper.js` - Craigslist settings
- `rvtraderScraper.js` - RVTrader settings
- `dataAxleService.js` - Data Axle configuration

## 📁 Project Structure

```
rvscraper/
├── backend/
│   ├── src/
│   │   ├── models/        # MongoDB schemas
│   │   ├── routes/        # API endpoints
│   │   ├── scrapers/      # Web scrapers
│   │   ├── services/      # Business logic
│   │   └── utils/         # Validators, helpers
│   └── .env               # Environment variables
├── frontend/
│   ├── src/
│   │   ├── pages/         # React pages
│   │   ├── services/      # API client
│   │   └── styles/        # CSS files
│   └── vite.config.js
└── README.md
```

## 🚦 API Endpoints

### Leads
- `GET /api/leads` - Get all leads
- `GET /api/leads/stats` - Get statistics
- `DELETE /api/leads/:id` - Delete lead

### Scrapers
- `POST /api/scraper/rvowners/craigslist` - Scrape Craigslist
- `POST /api/scraper/rvowners/dataaxle` - Search Data Axle
- `GET /api/scraper/dataaxle/account` - Check Data Axle status

### Campaigns
- `GET /api/campaigns` - List campaigns
- `POST /api/campaigns` - Create campaign
- `POST /api/campaigns/:id/send` - Send campaign

## 🔒 Security & Compliance

- **JWT Authentication** on all API routes
- **CAN-SPAM compliant** email templates
- **Do-Not-Call** tracking
- **Email opt-out** support
- **Data validation** to prevent scraping errors

## 📈 Performance

- **Scraping speed**: ~4 seconds per listing
- **Craigslist**: 50 leads in ~3-4 minutes
- **Data Axle**: 100 leads in ~5 seconds (API call)
- **Database**: Handles 100K+ leads efficiently

## 🐛 Troubleshooting

### "MongoDB connection failed"
- Ensure MongoDB is running: `mongod`
- Check `MONGO_URI` in `.env`

### "No listings found"
- Website HTML structure changed
- Update selectors in scraper files
- Check backend console for errors

### "Data Axle returns 0 results"
- Running in mock mode (no API credentials)
- Add credentials to `.env` and restart

## 📝 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📧 Support

For issues or questions, open a GitHub issue or contact support.

## 🎯 Roadmap

- [ ] Facebook Marketplace integration
- [ ] SMS campaigns via Twilio
- [ ] Advanced lead scoring
- [ ] CRM integrations (Salesforce, HubSpot)
- [ ] Mobile app

---

**Built with ❤️ for RV businesses**
