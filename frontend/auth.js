const API_URL = 'http://localhost:5000/api/auth';

document.addEventListener('DOMContentLoaded', () => {
    
    // Check if token already exists
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    
    // Auto redirect logic on load
    const isLoginPage = window.location.pathname.includes('login.html');
    const isRegisterPage = window.location.pathname.includes('register.html');

    if (token && (isLoginPage || isRegisterPage)) {
        window.location.href = 'dashboard.html';
    }

    // Handle Login Form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const loginBtn = document.getElementById('loginBtn');
            const rememberMe = document.getElementById('rememberMe').checked;

            try {
                // UI state
                loginBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Signing in...';
                loginBtn.disabled = true;

                const response = await fetch(`${API_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || 'Login failed');
                }

                // Success
                const storage = rememberMe ? localStorage : sessionStorage;
                storage.setItem('token', data.token);
                storage.setItem('username', data.user.username);
                
                showAuthAlert('loginAlert', 'Success! Redirecting...', 'success');
                setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);

            } catch (err) {
                showAuthAlert('loginAlert', err.message, 'danger');
            } finally {
                loginBtn.innerHTML = 'Sign In';
                loginBtn.disabled = false;
            }
        });
    }

    // Handle Register Form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('reg-username').value;
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;
            const registerBtn = document.getElementById('registerBtn');

            const isValidEmail = (em) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);
            const isStrongPassword = (pw) =>
              /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(pw);

            if (!username.trim() || username.trim().length < 3) {
                return showAuthAlert('registerAlert', 'Username must be at least 3 characters long.', 'danger');
            }

            if (!isValidEmail(email.trim())) {
                return showAuthAlert('registerAlert', 'Please enter a valid email address.', 'danger');
            }

            if (!isStrongPassword(password)) {
                return showAuthAlert('registerAlert', 'Password must be 8+ characters and contain uppercase, lowercase, number, and special character.', 'danger');
            }

            try {
                registerBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Registering...';
                registerBtn.disabled = true;

                const response = await fetch(`${API_URL}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: username.trim(), email: email.trim(), password })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || 'Registration failed');
                }

                showAuthAlert('registerAlert', 'Registration successful! Redirecting to login...', 'success');
                setTimeout(() => { window.location.href = 'login.html'; }, 1500);

            } catch (err) {
                showAuthAlert('registerAlert', err.message, 'danger');
            } finally {
                registerBtn.innerHTML = 'Register';
                registerBtn.disabled = false;
            }
        });
    }
});

function showAuthAlert(alertId, message, type) {
    const alertBox = document.getElementById(alertId);
    alertBox.className = `alert alert-${type} d-block`;
    alertBox.innerText = message;
}

// Global Logout function used by dashboard
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('username');
    window.location.href = 'login.html';
}
