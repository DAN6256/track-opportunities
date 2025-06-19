// API Configuration
const API_BASE_URL = 'https://track-opportunities.onrender.com/api';

// Global state
let currentUser = null;
let opportunities = [];
let currentEditingId = null;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (token) {
        currentUser = { token };
        showMainApp();
        loadDashboard();
    } else {
        showAuthSection();
    }
});

// Authentication Functions
function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-btn')[0].classList.add('active');
}

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-btn')[1].classList.add('active');
}

async function login(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    showLoading();
    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            currentUser = { token: data.token, userId: data.userId };
            showMainApp();
            loadDashboard();
            showToast('Login successful!', 'success');
        } else {
            showToast(data.error || 'Login failed', 'error');
        }
    } catch (error) {
        showToast('Network error. Please try again.', 'error');
    } finally {
        hideLoading();
    }
}

async function register(event) {
    event.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;

    showLoading();
    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            currentUser = { token: data.token, userId: data.userId };
            showMainApp();
            loadDashboard();
            showToast('Registration successful!', 'success');
        } else {
            showToast(data.error || 'Registration failed', 'error');
        }
    } catch (error) {
        showToast('Network error. Please try again.', 'error');
    } finally {
        hideLoading();
    }
}

function logout() {
    localStorage.removeItem('token');
    currentUser = null;
    opportunities = [];
    showAuthSection();
    showToast('Logged out successfully', 'success');
}

// Navigation Functions
function showAuthSection() {
    document.getElementById('authSection').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
}

function showMainApp() {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
}

function showDashboard() {
    hideAllSections();
    document.getElementById('dashboardSection').style.display = 'block';
    loadDashboard();
}

function showOpportunities() {
    hideAllSections();
    document.getElementById('opportunitiesSection').style.display = 'block';
    loadOpportunities();
}

function showStats() {
    hideAllSections();
    document.getElementById('statisticsSection').style.display = 'block';
    loadDetailedStats();
}

function hideAllSections() {
    document.querySelectorAll('.section').forEach(section => {
        section.style.display = 'none';
    });
}

// API Functions
async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers
        });

        if (response.status === 401) {
            logout();
            return null;
        }

        const data = await response.json();
        return { response, data };
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

// Dashboard Functions
async function loadDashboard() {
    showLoading();
    try {
        // Load opportunities and stats
        await loadOpportunities();
        await loadQuickStats();
        displayUpcomingDeadlines();
    } catch (error) {
        showToast('Failed to load dashboard', 'error');
    } finally {
        hideLoading();
    }
}

async function loadQuickStats() {
    try {
        const result = await apiCall('/stats');
        if (result) {
            displayQuickStats(result.data);
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

function displayQuickStats(stats) {
    const statsGrid = document.getElementById('quickStats');
    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${stats.total}</div>
            <div class="stat-label">Total Opportunities</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.pending}</div>
            <div class="stat-label">Pending</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.submitted}</div>
            <div class="stat-label">Submitted</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.interview}</div>
            <div class="stat-label">Interviews</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.offered}</div>
            <div class="stat-label">Offers</div>
        </div>
    `;
}

function displayUpcomingDeadlines() {
    //Changed from !== 'rejected' to === pending
    const container = document.getElementById('upcomingDeadlines');
    const today = new Date();
    const upcoming = opportunities
        .filter(opp => new Date(opp.deadline) >= today && opp.status === 'pending')
        .slice(0, 5);

    if (upcoming.length === 0) {
        container.innerHTML = '<p class="empty-state">No upcoming deadlines</p>';
        return;
    }

    container.innerHTML = upcoming.map(opp => {
        const deadline = new Date(opp.deadline);
        const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
        const isUrgent = daysLeft <= 7;

        return `
            <div class="opportunity-card">
                <div class="opportunity-header">
                    <div>
                        <div class="opportunity-title">${opp.title}</div>
                        <span class="opportunity-category">${formatCategory(opp.category)}</span>
                    </div>
                    <div class="opportunity-deadline ${isUrgent ? 'deadline-urgent' : ''}">
                        ${daysLeft === 0 ? 'Due Today!' : 
                          daysLeft === 1 ? 'Due Tomorrow' : 
                          `${daysLeft} days left`}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Opportunities Functions
async function loadOpportunities() {
    try {
        const statusFilter = document.getElementById('statusFilter')?.value || '';
        const categoryFilter = document.getElementById('categoryFilter')?.value || '';
        
        let endpoint = '/opportunities';
        const params = new URLSearchParams();
        if (statusFilter) params.append('status', statusFilter);
        if (categoryFilter) params.append('category', categoryFilter);
        
        if (params.toString()) {
            endpoint += `?${params.toString()}`;
        }

        const result = await apiCall(endpoint);
        if (result) {
            opportunities = result.data;
            displayOpportunities();
        }
    } catch (error) {
        showToast('Failed to load opportunities', 'error');
    }
}

function displayOpportunities() {
    const container = document.getElementById('opportunitiesList');
    
    if (opportunities.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No opportunities found</h3>
                <p>Start by adding your first opportunity!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = opportunities.map(opp => {
        const deadline = new Date(opp.deadline);
        const today = new Date();
        const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
        const isUrgent = daysLeft <= 7 && daysLeft >= 0;

        // Determine deadline status text
        let deadlineText;
        if (opp.status !== 'pending') {
            if (opp.submittedDate) {
                const submittedDate = new Date(opp.submittedDate);
                deadlineText = submittedDate <= deadline ? 'On Time' : 'Late';
            } else {
                deadlineText = 'On Time';
            }
        } else {
            if (daysLeft >= 0) {
                deadlineText = daysLeft === 0 ? 'Due Today!' : `${daysLeft} days left`;
            } else {
                deadlineText = 'Overdue';
            }
        }

        return `
            <div class="opportunity-card">
                <div class="opportunity-header">
                    <div>
                        <div class="opportunity-title">${opp.title}</div>
                        <span class="opportunity-category">${formatCategory(opp.category)}</span>
                    </div>
                    <div class="opportunity-deadline ${isUrgent && opp.status === 'pending' ? 'deadline-urgent' : ''}">
                        ${formatDate(opp.deadline)} (${deadlineText})
                    </div>
                </div>
                
                ${opp.description ? `<div class="opportunity-description">${opp.description}</div>` : ''}
                
                <div class="opportunity-details">
                    <span class="opportunity-status status-${opp.status}">${formatStatus(opp.status)}</span>
                    <div class="opportunity-actions">
                        <button class="btn btn-small btn-primary" onclick="editOpportunity('${opp.id}')">Edit</button>
                        <button class="btn btn-small btn-danger" onclick="deleteOpportunity('${opp.id}')">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}
// Modal Functions
function showAddOpportunityModal() {
    currentEditingId = null;
    document.getElementById('modalTitle').textContent = 'Add Opportunity';
    document.getElementById('opportunityForm').reset();
    document.getElementById('status').value = 'pending';
    document.getElementById('addOpportunityModal').style.display = 'block';
}

function editOpportunity(id) {
    const opportunity = opportunities.find(opp => opp.id === id);
    if (!opportunity) return;

    currentEditingId = id;
    document.getElementById('modalTitle').textContent = 'Edit Opportunity';
    document.getElementById('title').value = opportunity.title;
    document.getElementById('description').value = opportunity.description || '';
    document.getElementById('category').value = opportunity.category;
    document.getElementById('deadline').value = opportunity.deadline;
    document.getElementById('status').value = opportunity.status;
    document.getElementById('addOpportunityModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('addOpportunityModal').style.display = 'none';
    currentEditingId = null;
}

async function saveOpportunity(event) {
    event.preventDefault();
    
    const opportunityData = {
        title: document.getElementById('title').value,
        description: document.getElementById('description').value,
        category: document.getElementById('category').value,
        deadline: document.getElementById('deadline').value,
        status: document.getElementById('status').value,
    };

    showLoading();
    try {
        let result;
        if (currentEditingId) {
            result = await apiCall(`/opportunities/${currentEditingId}`, {
                method: 'PUT',
                body: JSON.stringify(opportunityData)
            });
        } else {
            result = await apiCall('/opportunities', {
                method: 'POST',
                body: JSON.stringify(opportunityData)
            });
        }

        if (result && result.response.ok) {
            closeModal();
            await loadOpportunities();
            await loadQuickStats();
            displayUpcomingDeadlines();
            showToast(currentEditingId ? 'Opportunity updated!' : 'Opportunity added!', 'success');
        } else {
            showToast(result?.data?.error || 'Failed to save opportunity', 'error');
        }
    } catch (error) {
        showToast('Failed to save opportunity', 'error');
    } finally {
        hideLoading();
    }
}

async function deleteOpportunity(id) {
    if (!confirm('Are you sure you want to delete this opportunity?')) return;

    showLoading();
    try {
        const result = await apiCall(`/opportunities/${id}`, {
            method: 'DELETE'
        });

        if (result && result.response.ok) {
            await loadOpportunities();
            await loadQuickStats();
            displayUpcomingDeadlines();
            showToast('Opportunity deleted!', 'success');
        } else {
            showToast(result?.data?.error || 'Failed to delete opportunity', 'error');
        }
    } catch (error) {
        showToast('Failed to delete opportunity', 'error');
    } finally {
        hideLoading();
    }
}

// Filter Functions
function filterOpportunities() {
    loadOpportunities();
}

// Statistics Functions
async function loadDetailedStats() {
    showLoading();
    try {
        const result = await apiCall('/stats');
        if (result) {
            displayDetailedStats(result.data);
        }
    } catch (error) {
        showToast('Failed to load statistics', 'error');
    } finally {
        hideLoading();
    }
}

function displayDetailedStats(stats) {
    const container = document.getElementById('detailedStats');
    
    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${stats.total}</div>
                <div class="stat-label">Total Opportunities</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.pending}</div>
                <div class="stat-label">Pending</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.submitted}</div>
                <div class="stat-label">Submitted</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.interview}</div>
                <div class="stat-label">Interviews</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.offered}</div>
                <div class="stat-label">Offers Received</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.rejected}</div>
                <div class="stat-label">Rejections</div>
            </div>
        </div>

        <div class="card">
            <h3>By Category</h3>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-number">${stats.byCategory.scholarship}</div>
                    <div class="stat-label">Scholarships</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.byCategory.graduate_school}</div>
                    <div class="stat-label">Graduate School</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.byCategory.conference}</div>
                    <div class="stat-label">Conferences</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.byCategory.internship}</div>
                    <div class="stat-label">Internships</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.byCategory.job}</div>
                    <div class="stat-label">Jobs</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.byCategory.other}</div>
                    <div class="stat-label">Other</div>
                </div>
            </div>
        </div>
    `;
}

// Utility Functions
function formatCategory(category) {
    const categories = {
        'scholarship': 'Scholarship',
        'graduate_school': 'Graduate School',
        'conference': 'Conference',
        'internship': 'Internship',
        'job': 'Job',
        'other': 'Other'
    };
    return categories[category] || category;
}

function formatStatus(status) {
    const statuses = {
        'pending': 'Pending',
        'submitted': 'Submitted',
        'interview': 'Interview',
        'offered': 'Offered',
        'rejected': 'Rejected'
    };
    return statuses[status] || status;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function showLoading() {
    document.getElementById('loadingSpinner').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingSpinner').style.display = 'none';
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// Event Listeners
window.onclick = function(event) {
    const modal = document.getElementById('addOpportunityModal');
    if (event.target === modal) {
        closeModal();
    }
}