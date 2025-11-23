// frontend/src/pages/Campaigns.jsx
import { useState, useEffect } from 'react';
import { getCampaigns, createCampaign, sendCampaign, deleteCampaign } from '../services/api';
import { useAuth } from '../context/AuthContext';
import '../styles/Campaigns.css';

const DEFAULT_TEMPLATE = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #ff6b35;">Fireside Hybrid RV Rental Franchise</h1>
        <p>Hi there,</p>
        <p>We wanted to share an exciting opportunity to add a new revenue stream to your existing business.</p>
        <p><strong>Interested in learning more?</strong></p>
        <a href="https://yourwebsite.com" style="background: #ff6b35; color: white; padding: 12px 30px; text-decoration: none; display: inline-block; border-radius: 5px;">Learn More</a>
        <p style="margin-top: 30px; font-size: 12px; color: #666;">
            <a href="{unsubscribe}">Unsubscribe</a> | Fireside RV Rentals
        </p>
    </div>
</body>
</html>
`.trim();

export default function Campaigns() {
    const [campaigns, setCampaigns] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        subject: '',
        emailTemplate: DEFAULT_TEMPLATE,
        recipientFilter: { state: '', type: '', status: '' }
    });
    const { logout } = useAuth();

    useEffect(() => {
        fetchCampaigns();
    }, []);

    const fetchCampaigns = async () => {
        try {
            const response = await getCampaigns();
            setCampaigns(response.data.campaigns);
        } catch (error) {
            console.error('Error fetching campaigns:', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await createCampaign(formData);
            setShowForm(false);
            setFormData({
                name: '',
                subject: '',
                emailTemplate: DEFAULT_TEMPLATE,
                recipientFilter: { state: '', type: '', status: '' }
            });
            fetchCampaigns();
            alert('Campaign created successfully!');
        } catch (error) {
            alert('Error creating campaign');
        }
    };

    const handleSend = async (id) => {
        if (!confirm('Are you sure you want to send this campaign?')) return;

        try {
            await sendCampaign(id);
            alert('Campaign is being sent in the background!');
            fetchCampaigns();
        } catch (error) {
            alert('Error sending campaign');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this campaign?')) return;

        try {
            await deleteCampaign(id);
            fetchCampaigns();
        } catch (error) {
            alert('Error deleting campaign');
        }
    };

    return (
        <div className="campaigns">
            <header className="dashboard-header">
                <h1>📧 Email Campaigns</h1>
                <div>
                    <button onClick={() => setShowForm(!showForm)} className="create-btn">
                        {showForm ? 'Cancel' : 'Create Campaign'}
                    </button>
                    <button onClick={logout} className="logout-btn">Logout</button>
                </div>
            </header>

            {showForm && (
                <div className="campaign-form-container">
                    <form onSubmit={handleSubmit} className="campaign-form">
                        <h2>Create New Campaign</h2>

                        <div className="form-group">
                            <label>Campaign Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                                placeholder="Texas RV Techs Outreach"
                            />
                        </div>

                        <div className="form-group">
                            <label>Email Subject</label>
                            <input
                                type="text"
                                value={formData.subject}
                                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                required
                                placeholder="New Revenue Opportunity for Your RV Business"
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Filter by State</label>
                                <select
                                    value={formData.recipientFilter.state}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        recipientFilter: { ...formData.recipientFilter, state: e.target.value }
                                    })}
                                >
                                    <option value="">All States</option>
                                    <option value="TX">Texas</option>
                                    <option value="CA">California</option>
                                    <option value="FL">Florida</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Filter by Type</label>
                                <select
                                    value={formData.recipientFilter.type}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        recipientFilter: { ...formData.recipientFilter, type: e.target.value }
                                    })}
                                >
                                    <option value="">All Types</option>
                                    <option value="RV Tech">RV Tech</option>
                                    <option value="U-Haul">U-Haul</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Email Template (HTML)</label>
                            <textarea
                                value={formData.emailTemplate}
                                onChange={(e) => setFormData({ ...formData, emailTemplate: e.target.value })}
                                required
                                rows="10"
                            />
                        </div>

                        <button type="submit" className="submit-btn">Create Campaign</button>
                    </form>
                </div>
            )}

            <div className="campaigns-list">
                {campaigns.length === 0 ? (
                    <p>No campaigns yet. Create your first one!</p>
                ) : (
                    <table className="campaigns-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Subject</th>
                                <th>Recipients</th>
                                <th>Status</th>
                                <th>Sent</th>
                                <th>Failed</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {campaigns.map((campaign) => (
                                <tr key={campaign._id}>
                                    <td>{campaign.name}</td>
                                    <td>{campaign.subject}</td>
                                    <td>{campaign.recipients?.length || 0}</td>
                                    <td><span className={`status status-${campaign.status.toLowerCase()}`}>{campaign.status}</span></td>
                                    <td>{campaign.sentCount}</td>
                                    <td>{campaign.failedCount}</td>
                                    <td>
                                        {campaign.status === 'Draft' && (
                                            <button
                                                onClick={() => handleSend(campaign._id)}
                                                className="send-btn"
                                            >
                                                Send
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDelete(campaign._id)}
                                            className="delete-btn"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
