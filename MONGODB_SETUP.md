# MongoDB Setup Options

The backend server requires MongoDB to run. You have two options:

## Option 1: MongoDB Atlas (Cloud - Recommended)
1. Go to https://www.mongodb.com/cloud/atlas/register
2. Create a free account
3. Create a free cluster (M0)
4. Get your connection string
5. I'll update the `.env` file with it

**Pros**: No installation, free, works everywhere
**Time**: ~5 minutes

## Option 2: Install MongoDB Locally
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Pros**: Runs locally
**Cons**: Requires installation
**Time**: ~10 minutes

Which option would you like to use?
