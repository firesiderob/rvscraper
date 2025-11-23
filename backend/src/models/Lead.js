// backend/src/models/Lead.js
const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
    businessName: {
        type: String,
        required: true
    },
    ownerName: String,  // Dedicated field for owner/seller name
    type: {
        type: String,
        enum: ['RV Tech', 'U-Haul', 'Storage Facility', 'RV Owner', 'Other'],
        required: true
    },
    address: String,
    city: String,
    state: {
        type: String,
        required: true
    },
    zip: String,
    phone: String,
    email: String,
    website: String,
    status: {
        type: String,
        enum: ['New', 'Contacted', 'Interested', 'Not Interested', 'Converted'],
        default: 'New'
    },
    notes: String,
    lastContacted: Date,
    // Compliance tracking
    compliance: {
        doNotCall: { type: Boolean, default: false },
        dncCheckedAt: Date,
        dncSource: String, // 'manual', 'twilio', 'searchbug', etc.
        emailOptOut: { type: Boolean, default: false },
        emailOptOutAt: Date,
        smsOptIn: { type: Boolean, default: false },
        smsOptInAt: Date
    },
    source: String, // Which scraper found this lead
    leadSource: {
        type: String,
        enum: ['Google Maps', 'Google Places API', 'RVillage', 'iRV2', 'RVTrader', 'Craigslist', 'DataAxle', 'Other']
    },
    // Data Axle specific fields
    dataAxleId: String, // Unique ID from Data Axle (for deduplication)
    demographics: {
        ageRange: String, // e.g., "45-54"
        income: String, // e.g., "$75K-$100K"
        homeOwner: Boolean
    },
    // RV Owner specific data
    rvDetails: {
        make: String,
        model: String,
        year: Number,
        rvType: String, // Class A, B, C, Travel Trailer, Fifth Wheel, etc.
        price: Number, // For listings
        listingUrl: String
    },
    // Engagement metrics (for forum users)
    engagement: {
        postCount: Number,
        joinDate: Date,
        lastActive: Date,
        username: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt timestamp before saving
leadSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Lead', leadSchema);
