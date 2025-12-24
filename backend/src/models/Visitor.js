const mongoose = require('mongoose');

const pageViewSchema = new mongoose.Schema({
  path: String,
  title: String,
  timestamp: { type: Date, default: Date.now },
  duration: Number // seconds on page
});

const visitorSchema = new mongoose.Schema({
  // Tracking identifiers
  visitorId: { type: String, required: true, index: true }, // Cookie-based ID
  ip: { type: String, index: true },

  // Geo data (from IP)
  city: String,
  state: String,
  country: String,
  zip: String,
  lat: Number,
  lon: Number,

  // Company identification (from reverse IP)
  company: String,
  companyDomain: String,
  isBusinessIP: { type: Boolean, default: false },

  // Device info
  userAgent: String,
  browser: String,
  os: String,
  device: String, // desktop, mobile, tablet
  screenResolution: String,

  // Traffic source
  referrer: String,
  utmSource: String,
  utmMedium: String,
  utmCampaign: String,
  landingPage: String,

  // Behavior tracking
  pageViews: [pageViewSchema],
  totalPageViews: { type: Number, default: 0 },
  totalTimeOnSite: { type: Number, default: 0 }, // seconds
  visitCount: { type: Number, default: 1 },

  // Conversion tracking
  formSubmitted: { type: Boolean, default: false },
  formData: {
    name: String,
    email: String,
    phone: String
  },

  // Timestamps
  firstVisit: { type: Date, default: Date.now },
  lastVisit: { type: Date, default: Date.now },

  // For Facebook export
  exportedToFacebook: { type: Boolean, default: false },
  exportedAt: Date
}, {
  timestamps: true
});

// Index for finding return visitors
visitorSchema.index({ visitorId: 1, ip: 1 });

// Index for exports
visitorSchema.index({ exportedToFacebook: 1, createdAt: -1 });

module.exports = mongoose.model('Visitor', visitorSchema);
