// backend/src/scripts/seedAdmin.js
// Run with: node src/scripts/seedAdmin.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function seedAdmin() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const existingUser = await User.findOne({ email: 'admin@fireside.com' });

        if (existingUser) {
            console.log('Admin user already exists. Updating password...');
            existingUser.password = 'password123';
            await existingUser.save();
            console.log('Password updated!');
        } else {
            const admin = new User({
                email: 'admin@fireside.com',
                password: 'password123',
                name: 'Admin',
                role: 'admin'
            });
            await admin.save();
            console.log('Admin user created!');
        }

        console.log('\nLogin credentials:');
        console.log('Email: admin@fireside.com');
        console.log('Password: password123');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

seedAdmin();
