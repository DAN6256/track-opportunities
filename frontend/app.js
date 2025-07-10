// API Configuration
const API_BASE_URL = 'https://track-opportunities.onrender.com/api';

// Cache Management
class Cache {
    constructor() {
        this.data = new Map();
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    }

    set(key, value) {
        this.data.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    get(key) {
        const cached = this.data.get(key);
        if (!cached) return null;
        
        if (Date.now() - cached.timestamp > this.CACHE_DURATION) {
            this.data.delete(key);
            return null;
        }
        
        return cached.value;
    }

    clear() {
        this.data.clear();
    }

    invalidate(pattern) {
        for (const [key] of this.data) {
            if (key.includes(pattern)) {
                this.data.delete(key);
            }
        }
    }
}

// API Client with caching and deduplication
class ApiClient {
    constructor() {
        this.cache = new Cache();
        this.pending = new Map();
    }

    async call(endpoint, options = {}) {
        const token = this.getToken();
        const cacheKey = `${endpoint}-${JSON.stringify(options)}`;
        
        // Return cached data if available and fresh
        const cached = this.cache.get(cacheKey);
        if (cached && !options.skipCache) {
            return cached;
        }

        // Deduplicate concurrent requests
        if (this.pending.has(cacheKey)) {
            return this.pending.get(cacheKey);
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        };

        const requestPromise = this.makeRequest(endpoint, { ...options, headers });
        this.pending.set(cacheKey, requestPromise);

        try {
            const result = await requestPromise;
            
            // Cache successful responses
            if (result.response.ok) {
                this.cache.set(cacheKey, result);
            }
            
            return result;
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        } finally {
            this.pending.delete(cacheKey);
        }
    }

    async makeRequest(endpoint, options) {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

        if (response.status === 401) {
            appState.logout();
            return null;
        }

        const data = await response.json();
        return { response, data };
    }

    getToken() {
        return currentUser?.token || '';
    }

    clearCache() {
        this.cache.clear();
    }

    invalidateCache(pattern) {
        this.cache.invalidate(pattern);
    }
}

// State Management
class AppState {
    constructor() {
        this.opportunities = [];
        this.stats = null;
        this.currentUser = null;
        this.currentSection = 'dashboard';
        this.filters = {
            status: '',
            category: ''
        };
        this.subscribers = new Map();
        this.updateQueue = [];
        this.updateScheduled = false;
    }

    subscribe(key, callback) {
        if (!this.subscribers.has(key)) {
            this.subscribers.set(key, []);
        }
        this.subscribers.get(key).push(callback);
    }

    notify(key) {
        const callbacks = this.subscribers.get(key) || [];
        callbacks.forEach(callback => {
            try {
                callback(this[key]);
            } catch (error) {
                console.error('Subscriber callback error:', error);
            }
        });
    }

    update(key, value) {
        if (this[key] !== value) {
            this[key] = value;
            this.scheduleUpdate(key);
        }
    }

    scheduleUpdate(key) {
        this.updateQueue.push(key);
        
        if (!this.updateScheduled) {
            this.updateScheduled = true;
            requestAnimationFrame(() => {
                this.processUpdateQueue();
                this.updateScheduled = false;
            });
        }
    }

    processUpdateQueue() {
        const uniqueKeys = [...new Set(this.updateQueue)];
        this.updateQueue = [];
        
        uniqueKeys.forEach(key => this.notify(key));
    }

    logout() {
        this.currentUser = null;
        this.opportunities = [];
        this.stats = null;
        apiClient.clearCache();
        showAuthSection();
        showToast('Logged out successfully', 'success');
    }
}

// Global instances
const apiClient = new ApiClient();
const appState = new AppState();
let currentUser = null;
let currentEditingId = null;

// Debounced functions
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    const token = getStoredToken();
    if (token) {
        currentUser = { token };
        appState.currentUser = currentUser;
        showMainApp();
        loadDashboard();
    } else {
        showAuthSection();
    }
    
    setupEventListeners();
});

// Helper functions
function getStoredToken() {
    try {
        return localStorage.getItem('token');
    } catch (error) {
        console.warn('localStorage not available');
        return null;
    }
}

function setStoredToken(token) {
    try {
        localStorage.setItem('token', token);
    } catch (error) {
        console.warn('localStorage not available');
    }
}

function removeStoredToken() {
    try {
        localStorage.removeItem('token');
    } catch (error) {
        console.warn('localStorage not available');
    }
}

// Event Listeners Setup
function setupEventListeners() {
    // Modal close handler
    document.addEventListener('click', function(event) {
        const modal = document.getElementById('addOpportunityModal');
        if (event.target === modal) {
            closeModal();
        }
    });

    // Debounced filter handlers
    const debouncedFilter = debounce(filterOpportunities, 300);
    
    const statusFilter = document.getElementById('statusFilter');
    const categoryFilter = document.getElementById('categoryFilter');
    
    if (statusFilter) {
        statusFilter.addEventListener('change', debouncedFilter);
    }
    
    if (categoryFilter) {
        categoryFilter.addEventListener('change', debouncedFilter);
    }
}

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
            setStoredToken(data.token);
            currentUser = { token: data.token, userId: data.userId };
            appState.currentUser = currentUser;
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
            setStoredToken(data.token);
            currentUser = { token: data.token, userId: data.userId };
            appState.currentUser = currentUser;
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
    removeStoredToken();
    currentUser = null;
    appState.logout();
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
    if (appState.currentSection === 'dashboard') return;
    
    hideAllSections();
    document.getElementById('dashboardSection').style.display = 'block';
    appState.currentSection = 'dashboard';
    
    // Load dashboard data if not already loaded recently
    const hasRecentData = appState.opportunities.length > 0 && appState.stats;
    if (!hasRecentData) {
        loadDashboard();
    } else {
        displayDashboardData();
    }
}

function showOpportunities() {
    if (appState.currentSection === 'opportunities') return;
    
    hideAllSections();
    document.getElementById('opportunitiesSection').style.display = 'block';
    appState.currentSection = 'opportunities';
    
    if (appState.opportunities.length === 0) {
        loadOpportunities();
    } else {
        displayOpportunities();
    }
}

function showStats() {
    if (appState.currentSection === 'stats') return;
    
    hideAllSections();
    document.getElementById('statisticsSection').style.display = 'block';
    appState.currentSection = 'stats';
        
    loadDetailedStats();
}

function hideAllSections() {
    document.querySelectorAll('.section').forEach(section => {
        section.style.display = 'none';
    });
}

// Dashboard Functions - Optimized with parallel loading
async function loadDashboard() {
    showLoading();
    try {
        // Load opportunities and stats in parallel
        const [opportunitiesResult, statsResult] = await Promise.all([
            apiClient.call('/opportunities'),
            apiClient.call('/stats')
        ]);

        if (opportunitiesResult?.response.ok) {
            appState.opportunities = opportunitiesResult.data;
        }

        if (statsResult?.response.ok) {
            appState.stats = statsResult.data;
        }

        displayDashboardData();
    } catch (error) {
        showToast('Failed to load dashboard', 'error');
    } finally {
        hideLoading();
    }
}

function displayDashboardData() {
    if (appState.stats) {
        displayQuickStats(appState.stats);
    }
    if (appState.opportunities.length > 0) {
        displayUpcomingDeadlines();
    }
}

function displayQuickStats(stats) {
    const statsGrid = document.getElementById('quickStats');
    if (!statsGrid) return;
    
    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${stats.total || 0}</div>
            <div class="stat-label">Total Opportunities</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.pending || 0}</div>
            <div class="stat-label">Pending</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.submitted || 0}</div>
            <div class="stat-label">Submitted</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.interview || 0}</div>
            <div class="stat-label">Interviews</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.offered || 0}</div>
            <div class="stat-label">Offers</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.rejected || 0}</div>
            <div class="stat-label">Rejections</div>
        </div>
    `;
}

function displayUpcomingDeadlines() {
    const container = document.getElementById('upcomingDeadlines');
    if (!container) return;
    
    const today = new Date();
    const upcoming = appState.opportunities
        .filter(opp => new Date(opp.deadline) >= today && opp.status === 'pending')
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
        .slice(0, 5);

    if (upcoming.length === 0) {
        container.innerHTML = '<p class="empty-state">No upcoming deadlines</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    
    upcoming.forEach(opp => {
        const deadline = new Date(opp.deadline);
        const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
        const isUrgent = daysLeft <= 7;

        const oppElement = document.createElement('div');
        oppElement.className = 'opportunity-card';
        oppElement.innerHTML = `
            <div class="opportunity-header">
                <div>
                    <div class="opportunity-title">${escapeHtml(opp.title)}</div>
                    <span class="opportunity-category">${formatCategory(opp.category)}</span>
                </div>
                <div class="opportunity-deadline ${isUrgent ? 'deadline-urgent' : ''}">
                    ${daysLeft === 0 ? 'Due Today!' : 
                      daysLeft === 1 ? 'Due Tomorrow' : 
                      `${daysLeft} days left`}
                </div>
            </div>
        `;
        
        fragment.appendChild(oppElement);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
}

// Opportunities Functions - Optimized with better filtering
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

        const result = await apiClient.call(endpoint);
        if (result?.response.ok) {
            appState.opportunities = result.data;
            displayOpportunities();
        }
    } catch (error) {
        showToast('Failed to load opportunities', 'error');
    }
}

function displayOpportunities() {
    const container = document.getElementById('opportunitiesList');
    if (!container) return;
    
    if (appState.opportunities.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No opportunities found</h3>
                <p>Start by adding your first opportunity!</p>
            </div>
        `;
        return;
    }

    // Use document fragment for better performance
    const fragment = document.createDocumentFragment();
    const today = new Date();

    appState.opportunities.forEach(opp => {
        const deadline = new Date(opp.deadline);
        const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
        const isUrgent = daysLeft <= 7 && daysLeft >= 0;

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

        const oppElement = document.createElement('div');
        oppElement.className = 'opportunity-card';
        oppElement.innerHTML = createOpportunityCardHTML(opp, deadline, deadlineText, isUrgent);
        
        fragment.appendChild(oppElement);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
}

function createOpportunityCardHTML(opp, deadline, deadlineText, isUrgent) {
    return `
        <div class="opportunity-header">
            <div>
                <div class="opportunity-title">${escapeHtml(opp.title)}</div>
                <span class="opportunity-category">${formatCategory(opp.category)}</span>
            </div>
            <div class="opportunity-deadline ${isUrgent && opp.status === 'pending' ? 'deadline-urgent' : ''}">
                ${formatDate(deadline.toISOString())} (${deadlineText})
            </div>
        </div>
        
        ${opp.description ? `<div class="opportunity-description">${escapeHtml(opp.description)}</div>` : ''}
        
        <div class="opportunity-details">
            <span class="opportunity-status status-${opp.status}">${formatStatus(opp.status)}</span>
            <div class="opportunity-actions">
                <button class="btn btn-small btn-primary" onclick="editOpportunity('${opp.id}')">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteOpportunity('${opp.id}')">Delete</button>
            </div>
        </div>
    `;
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
    const opportunity = appState.opportunities.find(opp => opp.id === id);
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
        title: document.getElementById('title').value.trim(),
        description: document.getElementById('description').value.trim(),
        category: document.getElementById('category').value,
        deadline: document.getElementById('deadline').value,
        status: document.getElementById('status').value,
    };

    // Client-side validation
    if (!opportunityData.title || !opportunityData.category || !opportunityData.deadline) {
        showToast('Please fill in all required fields', 'error');
        return;
    }

    showLoading();
    try {
        let result;
        if (currentEditingId) {
            result = await apiClient.call(`/opportunities/${currentEditingId}`, {
                method: 'PUT',
                body: JSON.stringify(opportunityData),
                skipCache: true
            });
        } else {
            result = await apiClient.call('/opportunities', {
                method: 'POST',
                body: JSON.stringify(opportunityData),
                skipCache: true
            });
        }

        if (result?.response.ok) {
            closeModal();
            
            // Invalidate relevant caches
            apiClient.invalidateCache('opportunities');
            apiClient.invalidateCache('stats');
            
            // Refresh data
            await Promise.all([
                loadOpportunities(),
                loadQuickStats()
            ]);
            
            if (appState.currentSection === 'dashboard') {
                displayUpcomingDeadlines();
            }
            
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
        const result = await apiClient.call(`/opportunities/${id}`, {
            method: 'DELETE',
            skipCache: true
        });

        if (result?.response.ok) {
            // Invalidate relevant caches
            apiClient.invalidateCache('opportunities');
            apiClient.invalidateCache('stats');
            
            // Refresh data
            await Promise.all([
                loadOpportunities(),
                loadQuickStats()
            ]);
            
            if (appState.currentSection === 'dashboard') {
                displayUpcomingDeadlines();
            }
            
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

// Filter Functions - Debounced
const filterOpportunities = debounce(() => {
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    const categoryFilter = document.getElementById('categoryFilter')?.value || '';
    
    appState.filters = { status: statusFilter, category: categoryFilter };
    loadOpportunities();
}, 300);

// Statistics Functions
async function loadDetailedStats() {
    showLoading();
    try {
        const result = await apiClient.call('/stats');
        if (result?.response.ok && result.data) {
            appState.stats = result.data;
            displayDetailedStats(result.data);
        } else {
            // Handle case where stats endpoint returns empty or error
            console.error('Stats API returned:', result);
            showToast('No statistics data available', 'warning');
            displayEmptyStats();
        }
    } catch (error) {
        console.error('Failed to load statistics:', error);
        showToast('Failed to load statistics', 'error');
        displayEmptyStats();
    } finally {
        hideLoading();
    }
}

async function loadQuickStats() {
    try {
        const result = await apiClient.call('/stats');
        if (result?.response.ok) {
            appState.stats = result.data;
            if (appState.currentSection === 'dashboard') {
                displayQuickStats(result.data);
            }
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

function displayDetailedStats(stats) {
    const container = document.getElementById('detailedStats');
    if (!container) {
        console.error('detailedStats container not found');
        return;
    }
    
    // Ensure stats object has default values
    const safeStats = {
        total: stats?.total || 0,
        pending: stats?.pending || 0,
        submitted: stats?.submitted || 0,
        interview: stats?.interview || 0,
        offered: stats?.offered || 0,
        rejected: stats?.rejected || 0,
        byCategory: stats?.byCategory || {}
    };
    
    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${safeStats.total}</div>
                <div class="stat-label">Total Opportunities</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${safeStats.pending}</div>
                <div class="stat-label">Pending</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${safeStats.submitted}</div>
                <div class="stat-label">Submitted</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${safeStats.interview}</div>
                <div class="stat-label">Interviews</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${safeStats.offered}</div>
                <div class="stat-label">Offers Received</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${safeStats.rejected}</div>
                <div class="stat-label">Rejections</div>
            </div>
        </div>

        <div class="card">
            <h3>By Category</h3>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-number">${safeStats.byCategory.scholarship || 0}</div>
                    <div class="stat-label">Scholarships</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${safeStats.byCategory.graduate_school || 0}</div>
                    <div class="stat-label">Graduate School</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${safeStats.byCategory.conference || 0}</div>
                    <div class="stat-label">Conferences</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${safeStats.byCategory.internship || 0}</div>
                    <div class="stat-label">Internships</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${safeStats.byCategory.job || 0}</div>
                    <div class="stat-label">Jobs</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${safeStats.byCategory.other || 0}</div>
                    <div class="stat-label">Other</div>
                </div>
            </div>
        </div>

        ${safeStats.total === 0 ? `
        <div class="empty-state">
            <h3>No Statistics Available</h3>
            <p>Add some opportunities to see your statistics!</p>
        </div>
        ` : ''}
    `;
}

function displayEmptyStats() {
    const container = document.getElementById('detailedStats');
    if (!container) return;
    
    container.innerHTML = `
        <div class="empty-state">
            <h3>Unable to Load Statistics</h3>
            <p>There was an error loading your statistics. Please try refreshing the page.</p>
            <button class="btn btn-primary" onclick="loadDetailedStats()">Retry</button>
        </div>
    `;
}

function debugStats() {
    console.log('Current app state:', appState);
    console.log('Statistics container exists:', !!document.getElementById('detailedStats'));
    console.log('Current section:', appState.currentSection);
    console.log('Statistics section visible:', document.getElementById('statisticsSection')?.style.display);
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
    try {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (error) {
        return 'Invalid Date';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

let loadingCount = 0;

function showLoading() {
    loadingCount++;
    document.getElementById('loadingSpinner').style.display = 'flex';
}

function hideLoading() {
    loadingCount = Math.max(0, loadingCount - 1);
    if (loadingCount === 0) {
        document.getElementById('loadingSpinner').style.display = 'none';
    }
}

// Toast system with queue
const toastQueue = [];
let isShowingToast = false;

function showToast(message, type = 'info') {
    toastQueue.push({ message, type });
    processToastQueue();
}

function processToastQueue() {
    if (isShowingToast || toastQueue.length === 0) return;
    
    isShowingToast = true;
    const { message, type } = toastQueue.shift();
    
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
        isShowingToast = false;
        processToastQueue(); // Process next toast in queue
    }, 5000);
}