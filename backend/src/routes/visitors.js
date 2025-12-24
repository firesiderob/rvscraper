const express = require('express');
const router = express.Router();
const Visitor = require('../models/Visitor');
const auth = require('../middleware/auth');

// Free IP geolocation API (no key required, 45 requests/minute)
async function getGeoFromIP(ip) {
  try {
    // Skip local IPs
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return null;
    }

    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,regionName,country,zip,lat,lon,isp,org,as`);
    const data = await response.json();

    if (data.status === 'success') {
      return {
        city: data.city,
        state: data.regionName,
        country: data.country,
        zip: data.zip,
        lat: data.lat,
        lon: data.lon,
        company: data.org || data.isp,
        isBusinessIP: !!(data.org && !data.org.includes('Residential'))
      };
    }
    return null;
  } catch (error) {
    console.error('Geo lookup error:', error.message);
    return null;
  }
}

// Parse user agent
function parseUserAgent(ua) {
  const result = {
    browser: 'Unknown',
    os: 'Unknown',
    device: 'desktop'
  };

  if (!ua) return result;

  // Browser detection
  if (ua.includes('Chrome')) result.browser = 'Chrome';
  else if (ua.includes('Firefox')) result.browser = 'Firefox';
  else if (ua.includes('Safari')) result.browser = 'Safari';
  else if (ua.includes('Edge')) result.browser = 'Edge';

  // OS detection
  if (ua.includes('Windows')) result.os = 'Windows';
  else if (ua.includes('Mac OS')) result.os = 'MacOS';
  else if (ua.includes('Linux')) result.os = 'Linux';
  else if (ua.includes('Android')) result.os = 'Android';
  else if (ua.includes('iOS') || ua.includes('iPhone')) result.os = 'iOS';

  // Device detection
  if (ua.includes('Mobile')) result.device = 'mobile';
  else if (ua.includes('Tablet') || ua.includes('iPad')) result.device = 'tablet';

  return result;
}

/**
 * POST /api/visitors/track
 * Main tracking endpoint - called by the tracking pixel
 */
router.post('/track', async (req, res) => {
  try {
    const {
      visitorId,
      page,
      title,
      referrer,
      screenResolution,
      utmSource,
      utmMedium,
      utmCampaign,
      duration
    } = req.body;

    // Get real IP (handle proxies)
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Find existing visitor or create new
    let visitor = await Visitor.findOne({ visitorId });

    if (visitor) {
      // Returning visitor
      visitor.visitCount += 1;
      visitor.lastVisit = new Date();
      visitor.pageViews.push({
        path: page,
        title: title,
        timestamp: new Date(),
        duration: duration || 0
      });
      visitor.totalPageViews += 1;
      visitor.totalTimeOnSite += (duration || 0);

    } else {
      // New visitor - do geo lookup
      const geoData = await getGeoFromIP(ip);
      const deviceData = parseUserAgent(userAgent);

      visitor = new Visitor({
        visitorId,
        ip,
        userAgent,
        ...deviceData,
        ...geoData,
        referrer,
        screenResolution,
        utmSource,
        utmMedium,
        utmCampaign,
        landingPage: page,
        pageViews: [{
          path: page,
          title: title,
          timestamp: new Date()
        }],
        totalPageViews: 1
      });
    }

    await visitor.save();

    // Return 1x1 transparent pixel (or JSON for modern tracking)
    res.status(200).json({ success: true, visitorId: visitor.visitorId });

  } catch (error) {
    console.error('Tracking error:', error);
    res.status(200).json({ success: false }); // Always return 200 to not break client
  }
});

/**
 * POST /api/visitors/form
 * Track form submissions with contact info
 */
router.post('/form', async (req, res) => {
  try {
    const { visitorId, name, email, phone } = req.body;

    const visitor = await Visitor.findOne({ visitorId });
    if (visitor) {
      visitor.formSubmitted = true;
      visitor.formData = { name, email, phone };
      await visitor.save();
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/visitors
 * Get all visitors (admin only)
 */
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 50, hasCompany, formSubmitted } = req.query;

    const filter = {};
    if (hasCompany === 'true') filter.isBusinessIP = true;
    if (formSubmitted === 'true') filter.formSubmitted = true;

    const visitors = await Visitor.find(filter)
      .sort({ lastVisit: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .select('-pageViews'); // Exclude pageViews for list view

    const total = await Visitor.countDocuments(filter);

    res.json({
      visitors,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/visitors/stats
 * Get visitor statistics
 */
router.get('/stats', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [
      totalVisitors,
      todayVisitors,
      weekVisitors,
      businessVisitors,
      formSubmissions,
      topLocations
    ] = await Promise.all([
      Visitor.countDocuments(),
      Visitor.countDocuments({ firstVisit: { $gte: today } }),
      Visitor.countDocuments({ firstVisit: { $gte: weekAgo } }),
      Visitor.countDocuments({ isBusinessIP: true }),
      Visitor.countDocuments({ formSubmitted: true }),
      Visitor.aggregate([
        { $match: { state: { $ne: null } } },
        { $group: { _id: '$state', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    res.json({
      totalVisitors,
      todayVisitors,
      weekVisitors,
      businessVisitors,
      formSubmissions,
      topLocations
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/visitors/export/facebook
 * Export visitors in Facebook Custom Audience format
 */
router.get('/export/facebook', auth, async (req, res) => {
  try {
    const { includeAll, onlyNew } = req.query;

    const filter = {};
    if (onlyNew === 'true') {
      filter.exportedToFacebook = { $ne: true };
    }

    const visitors = await Visitor.find(filter).sort({ lastVisit: -1 });

    // Build CSV
    const header = 'email,phone,city,state,zip,country,fn,ln';
    const rows = [header];

    for (const v of visitors) {
      // Use form data if available, otherwise use geo data
      const email = v.formData?.email || '';
      const phone = v.formData?.phone?.replace(/[^0-9]/g, '') || '';
      const name = v.formData?.name || '';
      const nameParts = name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Only include if we have some identifying info
      if (email || phone || (v.city && v.state)) {
        const row = [
          email,
          phone.length === 10 ? '1' + phone : phone,
          v.city || '',
          v.state || '',
          v.zip || '',
          v.country === 'United States' ? 'US' : (v.country || 'US'),
          firstName,
          lastName
        ].map(f => '"' + (f || '').replace(/"/g, '""') + '"').join(',');

        rows.push(row);
      }

      // Mark as exported
      v.exportedToFacebook = true;
      v.exportedAt = new Date();
      await v.save();
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=facebook_audience_' + Date.now() + '.csv');
    res.send(rows.join('\n'));

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/visitors/:id
 * Delete a visitor record
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    await Visitor.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
