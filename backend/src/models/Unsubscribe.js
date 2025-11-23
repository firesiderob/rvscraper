// backend/src/models/Unsubscribe.js
const mongoose = require('mongoose');

const unsubscribeSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    unsubscribedAt: {
        type: Date,
        default: Date.now
    },
    reason: String,
    source: {
        type: String,
        enum: ['email_link', 'manual', 'bounce', 'complaint'],
        default: 'email_link'
    },
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Campaign'
    },
    ipAddress: String,
    userAgent: String
});

// Index for fast lookups
unsubscribeSchema.index({ email: 1 });

// Static method to check if email is unsubscribed
unsubscribeSchema.statics.isUnsubscribed = async function (email) {
    const unsubscribe = await this.findOne({ email: email.toLowerCase() });
    return !!unsubscribe;
};

// Static method to add to unsubscribe list
unsubscribeSchema.statics.addToList = async function (email, reason, source = 'email_link') {
    return await this.findOneAndUpdate(
        { email: email.toLowerCase() },
        {
            email: email.toLowerCase(),
            unsubscribedAt: new Date(),
            reason,
            source
        },
        { upsert: true, new: true }
    );
};

module.exports = mongoose.model('Unsubscribe', unsubscribeSchema);
