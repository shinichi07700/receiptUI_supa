// ============================================================
// Authentication (Google OAuth via Supabase)
// Uses supabase client (session-aware) for login/logout
// ============================================================

/**
 * Sign in with Google OAuth.
 */
async function signInWithGoogle() {
    // Logic: OAuth (Google Login) requires a web server context. 
    // It will not work if the file is opened directly via file://
    if (window.location.protocol === 'file:') {
        showLoginError('Google Sign-In requires a running server. Please open this via localhost (e.g. http://localhost:8000) instead of opening the file directly.');
        return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + window.location.pathname,
        },
    });
    if (error) {
        console.error('Login error:', error.message);
        showLoginError('Failed to start login. Please try again.');
    }
}

/**
 * Sign out and redirect to login page.
 */
async function signOut() {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
}

/**
 * Get the current session. Returns null if not authenticated.
 */
async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

/**
 * Check if the current user's email is in the admin whitelist.
 */
function isAllowedEmail(email) {
    return ALLOWED_EMAILS.map(e => e.toLowerCase()).includes(email.toLowerCase());
}

/**
 * Guard for protected pages.
 * Returns the session if valid, otherwise redirects.
 */
async function requireAuth() {
    const session = await getSession();
    if (!session) {
        window.location.href = 'index.html';
        return null;
    }
    if (!isAllowedEmail(session.user.email)) {
        await supabase.auth.signOut();
        window.location.href = 'index.html?error=unauthorized';
        return null;
    }
    return session;
}

/**
 * Show a login error message.
 */
function showLoginError(msg) {
    const el = document.getElementById('login-error');
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
    }
}

// ------------------------------------
// Login page initialization
// ------------------------------------
function initLoginPage() {
    const loginBtn = document.getElementById('google-login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', signInWithGoogle);
    }

    // Check URL params for errors
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'unauthorized') {
        showLoginError('Your account is not authorized. Contact the administrator.');
    }

    // Listen for auth state changes (handles OAuth redirect)
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            if (isAllowedEmail(session.user.email)) {
                window.location.href = 'dashboard.html';
            } else {
                await supabase.auth.signOut();
                showLoginError('Your account is not authorized. Contact the administrator.');
            }
        }
    });

    // If already logged in, redirect to dashboard
    getSession().then(session => {
        if (session && isAllowedEmail(session.user.email)) {
            window.location.href = 'dashboard.html';
        }
    });
}
