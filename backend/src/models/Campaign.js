// backend/src/models/Campaign.js
const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    subject: {
        type: String,
        required: true
    },
    emailTemplate: {
        type: String,
        required: true
    },
    recipients: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead'
    }],
    status: {
        type: String,
        enum: ['Draft', 'Scheduled', 'Sending', 'Sent', 'Failed'],
        default: 'Draft'
    },
    sentCount: {
        type: Number,
        default: 0
    },
    failedCount: {
        type: Number,
        default: 0
    },
    scheduledFor: Date,
    sentAt: Date,
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Campaign', campaignSchema);
