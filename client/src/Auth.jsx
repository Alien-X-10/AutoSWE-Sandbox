import React, { useState, useMemo } from 'react';
import './Auth.css';

export default function Auth({ onAuthSuccess, onNavigateAbout }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'register'
  const [fullName, setFullName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Generate the 3D golden wireframe wave mesh for the bottom-left corner
  const wireframeMesh = useMemo(() => {
    const horizontalPaths = [];
    const crossPaths = [];
    const rows = 16;
    const cols = 34;

    const getPoint = (r, c) => {
      const t = c / (cols - 1); // 0 to 1 along width
      const s = r / (rows - 1); // 0 to 1 depth
      const x = -20 + t * 760 + s * 45;
      const wave1 = Math.sin(t * Math.PI * 3.1 - s * 1.4) * (38 - s * 14);
      const wave2 = Math.cos(t * Math.PI * 1.7 + s * 0.9) * 22;
      const slope = t * 65; // gently slopes down toward the right
      const y = 78 + s * 105 + wave1 + wave2 + slope;
      return { x, y };
    };

    for (let r = 0; r < rows; r++) {
      let d = '';
      for (let c = 0; c < cols; c++) {
        const pt = getPoint(r, c);
        d += `${c === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)} `;
      }
      horizontalPaths.push({ d, opacity: (0.18 + (1 - r / rows) * 0.48).toFixed(2) });
    }

    for (let c = 0; c < cols; c++) {
      let d = '';
      for (let r = 0; r < rows; r++) {
        const pt = getPoint(r, c);
        d += `${r === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)} `;
      }
      crossPaths.push({ d, opacity: (0.14 + (1 - c / cols) * 0.32).toFixed(2) });
    }

    return { horizontalPaths, crossPaths };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!identifier.trim() || !password.trim()) {
      setErrorMsg('Please enter your credentials.');
      return;
    }

    setLoading(true);
    try {
      const endpoint =
        mode === 'register'
          ? 'http://localhost:3001/api/auth/register'
          : 'http://localhost:3001/api/auth/login';

      // const res = await fetch(endpoint, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     name: fullName.trim() || identifier.split('@')[0],
      //     identifier: identifier.trim(),
      //     password
      //   })
      // });

      const res = await fetch(endpoint, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: fullName.trim() || identifier.split('@')[0],
    identifier: identifier.trim(),
    password
  })
});

      // if (res.ok) {
      //   const data = await res.json();
      //   const userPayload = {
      //     name: data.user?.name || identifier.split('@')[0],
      //     email: data.user?.email || identifier,
      //     token: data.token || 'local-session-token',
      //     role: 'SWE Engineer'
      //   };
      //   localStorage.setItem('autoswe_user', JSON.stringify(userPayload));
      //   if (onAuthSuccess) onAuthSuccess(userPayload);
      //   return;
      // } else {

        if (res.ok) {
  const data = await res.json();

  if (mode === 'register') {
    setErrorMsg('Account created successfully. Please sign in.');
    setMode('signin');
    setPassword('');
    return;
  }

  if (onAuthSuccess) {
    onAuthSuccess(data.user);
  }

  return;
} else {
        const errData = await res.json().catch(() => ({}));
        // if (res.status === 404) {
        //   // Fallback before backend routes are attached
        //   const fallbackUser = {
        //     name: fullName.trim() || identifier.split('@')[0] || 'Engineer',
        //     email: identifier.trim(),
        //     token: 'session-token',
        //     role: 'SWE Engineer'
        //   };
        //   localStorage.setItem('autoswe_user', JSON.stringify(fallbackUser));
        //   if (onAuthSuccess) onAuthSuccess(fallbackUser);
        //   return;
        // }
        setErrorMsg(errData.error || 'Authentication failed. Please check your credentials.');
      }
    // } catch {
    //   // Smooth local fallback if backend auth endpoint isn't wired yet
    //   const fallbackUser = {
    //     name: fullName.trim() || identifier.split('@')[0] || 'Engineer',
    //     email: identifier.trim(),
    //     token: 'session-token',
    //     role: 'SWE Engineer'
    //   };
    //   localStorage.setItem('autoswe_user', JSON.stringify(fallbackUser));
    //   if (onAuthSuccess) onAuthSuccess(fallbackUser);
    // } finally {

    } catch {
  setErrorMsg('Unable to connect to the server. Please try again.');
} finally {
      setLoading(false);
    }
  };

  // const handleGuestDemo = () => {
  //   const guestUser = {
  //     name: 'Guest Engineer',
  //     email: 'demo@autoswe.dev',
  //     token: 'guest-demo-token',
  //     role: 'Demo Access'
  //   };
  //   localStorage.setItem('autoswe_user', JSON.stringify(guestUser));
  //   if (onAuthSuccess) onAuthSuccess(guestUser);
  // };

  const handleGuestDemo = () => {
  setErrorMsg('Guest access is currently unavailable. Please sign in or create an account.');
};

  return (
    <div className="auth-page-shell">
      {/* ================= TOP HEADER BAR ================= */}
      <header className="auth-topbar">
        <div className="auth-topbar-left">
          <svg width="24" height="22" viewBox="0 0 26 22" fill="none">
            <path d="M7 2L12 2L6 20L1 20L7 2Z" fill="#e5b85c" />
            <path d="M15 2L20 2L14 20L9 20L15 2Z" fill="#c7912c" />
          </svg>
          <span className="auth-topbar-brand">AutoSWE Sandbox</span>
        </div>

        <div className="auth-topbar-right">
          <span className="auth-version-tag">v1.0.4 Demo</span>
          <a
            href="#about"
            className="auth-help-link"
            onClick={(e) => {
              if (onNavigateAbout) {
                e.preventDefault();
                onNavigateAbout();
              }
            }}
          >
            Help
          </a>
        </div>
      </header>

      {/* ================= MAIN SPLIT CONTENT ================= */}
      <div className="auth-split-stage">
        {/* LEFT COLUMN: BRAND PITCH & MINI ARCHITECTURE DIAGRAM */}
        <section className="auth-left-hero">
          {/* App Emblem + Portal Subtitle */}
          <div className="auth-portal-badge">
            <div className="auth-emblem-box">
              <svg width="28" height="26" viewBox="0 0 26 22" fill="none">
                <path d="M7 2L12.5 2L6.5 20L1 20L7 2Z" fill="#edc267" />
                <path d="M15.5 2L21 2L15 20L9.5 20L15.5 2Z" fill="#c9922c" />
              </svg>
            </div>
            <div className="auth-portal-text">
              <h2>AutoSWE Sandbox</h2>
              <p>Authentication &amp; Workspace Portal</p>
            </div>
          </div>

          {/* Metallic Gold Headline */}
          <h1 className="auth-main-headline">
            The Autonomous C++20
            <br />
            Software Engineering Agent
          </h1>

          <p className="auth-lead-copy">
            Write, debug, and verify repositories within an isolated
            <br />
            Docker sandbox.
          </p>

          {/* 3 Gold Feature Highlights */}
          <div className="auth-feature-list">
            <div className="auth-feature-item">
              <span className="auth-feature-icon">
                {/* Gold Robot Icon */}
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <line x1="12" y1="2" x2="12" y2="5" stroke="#f0c365" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="2" r="1.5" fill="#f9dc8c" />
                  <rect x="4" y="5" width="16" height="13" rx="3.5" fill="url(#goldGrad)" stroke="#fbe29d" strokeWidth="1" />
                  <circle cx="9" cy="11" r="1.6" fill="#181207" />
                  <circle cx="15" cy="11" r="1.6" fill="#181207" />
                  <rect x="8.5" y="14.5" width="7" height="1.6" rx="0.8" fill="#181207" />
                  <rect x="2" y="9" width="2" height="5" rx="1" fill="#d9a13c" />
                  <rect x="20" y="9" width="2" height="5" rx="1" fill="#d9a13c" />
                  <defs>
                    <linearGradient id="goldGrad" x1="4" y1="5" x2="20" y2="18" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#f8db89" />
                      <stop offset="1" stopColor="#c88d28" />
                    </linearGradient>
                  </defs>
                </svg>
              </span>
              <span className="auth-feature-label">ReAct Thinking Loop</span>
            </div>

            <div className="auth-feature-item">
              <span className="auth-feature-icon">
                {/* Gold Shield Check Icon */}
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2.5L4.5 5.8V11.5C4.5 16.5 7.7 20.9 12 22.2C16.3 20.9 19.5 16.5 19.5 11.5V5.8L12 2.5Z"
                    fill="url(#shieldGrad)"
                    stroke="#fbe29d"
                    strokeWidth="1"
                  />
                  <path
                    d="M9 12.2L11.1 14.3L15.4 10"
                    stroke="#181207"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <defs>
                    <linearGradient id="shieldGrad" x1="4.5" y1="2.5" x2="19.5" y2="22" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#f8db89" />
                      <stop offset="1" stopColor="#c68a24" />
                    </linearGradient>
                  </defs>
                </svg>
              </span>
              <span className="auth-feature-label">Isolated Docker Sandbox</span>
            </div>

            <div className="auth-feature-item">
              <span className="auth-feature-icon">
                {/* Gold Satellite Dish Icon */}
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M14.5 4.5C17.5 4.5 19.5 6.5 19.5 9.5"
                    stroke="#f6cf77"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M14.5 7.5C16 7.5 16.8 8.3 16.8 9.8"
                    stroke="#f6cf77"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M6.2 9.2C3.8 11.6 3.8 15.5 6.2 17.9C8.6 20.3 12.5 20.3 14.9 17.9L6.2 9.2Z"
                    fill="url(#satGrad)"
                    stroke="#fbe29d"
                    strokeWidth="1"
                  />
                  <line x1="10.8" y1="13.2" x2="15.2" y2="8.8" stroke="#fbe29d" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M5 21H12L9.5 18.2H7.5L5 21Z" fill="#c98f29" />
                  <defs>
                    <linearGradient id="satGrad" x1="4" y1="9" x2="15" y2="19" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#f8db89" />
                      <stop offset="1" stopColor="#c68a24" />
                    </linearGradient>
                  </defs>
                </svg>
              </span>
              <span className="auth-feature-label">Live Telemetry &amp; Diffs</span>
            </div>
          </div>

          {/* 3-Node Brain -> Orchestrator -> Docker Mini Architecture Diagram */}
          <div className="auth-mini-diagram">
            <svg viewBox="0 0 430 165" className="auth-diagram-svg">
              {/* Node 1: Brain Box */}
              <g>
                <rect
                  x="10"
                  y="12"
                  width="76"
                  height="74"
                  rx="12"
                  fill="#17120a"
                  stroke="#b98b39"
                  strokeWidth="1.4"
                />
                <ellipse cx="48" cy="74" rx="22" ry="6" fill="rgba(235, 182, 70, 0.25)" />
                {/* Brain Icon */}
                <g transform="translate(26, 26)" stroke="#f0c365" strokeWidth="1.7" fill="none" strokeLinecap="round">
                  <path d="M21 6C18.5 3.5 14 4 12.5 7C9.5 6.5 6.5 8.8 6.5 12C4 13.5 3.8 17.5 6 19.8C5.5 23 8 26 11.5 26H21V6Z" />
                  <path d="M21 6C23.5 3.5 28 4 29.5 7C32.5 6.5 35.5 8.8 35.5 12C38 13.5 38.2 17.5 36 19.8C36.5 23 34 26 30.5 26H21" />
                  <path d="M12 12C14.5 12 16 14 16 16.5" />
                  <path d="M30 12C27.5 12 26 14 26 16.5" />
                  <path d="M11 20H16.5" />
                  <path d="M25.5 20H31" />
                </g>
              </g>

              {/* Straight Top Arrow: Brain -> Docker */}
              <line x1="94" y1="44" x2="294" y2="44" stroke="#d5a449" strokeWidth="1.5" />
              <polyline points="288,39 295,44 288,49" fill="none" stroke="#d5a449" strokeWidth="1.6" />

              {/* Curved Arrow: Brain -> Orchestrator */}
              <path
                d="M 93 58 C 122 58, 125 112, 150 118"
                fill="none"
                stroke="#d5a449"
                strokeWidth="1.5"
              />
              <polyline points="145,113 152,118 144,122" fill="none" stroke="#d5a449" strokeWidth="1.5" />

              {/* Node 2: Orchestrator Loop Box (Center-Bottom) */}
              <g>
                <rect
                  x="156"
                  y="74"
                  width="74"
                  height="74"
                  rx="12"
                  fill="#17120a"
                  stroke="#b98b39"
                  strokeWidth="1.4"
                />
                {/* 4-Node Circular Orchestrator Icon */}
                <circle cx="193" cy="111" r="18" stroke="#d9a544" strokeWidth="1.5" fill="none" />
                <circle cx="193" cy="93" r="4.5" fill="#f3c86a" />
                <circle cx="193" cy="129" r="4.5" fill="#f3c86a" />
                <circle cx="175" cy="111" r="4.5" fill="#f3c86a" />
                <rect x="206" y="106" width="10" height="10" rx="2.5" fill="#f3c86a" />
              </g>

              {/* Curved Arrow: Orchestrator -> Docker */}
              <path
                d="M 235 118 C 266 118, 266 60, 294 58"
                fill="none"
                stroke="#d5a449"
                strokeWidth="1.5"
              />
              <polyline points="288,53 295,58 289,63" fill="none" stroke="#d5a449" strokeWidth="1.5" />

              {/* Node 3: Docker Sandbox Box */}
              <g>
                <rect
                  x="304"
                  y="10"
                  width="92"
                  height="82"
                  rx="12"
                  fill="#17120a"
                  stroke="#c7963f"
                  strokeWidth="1.5"
                />
                <ellipse cx="350" cy="77" rx="30" ry="7" fill="rgba(235, 182, 70, 0.28)" />
                {/* Docker Whale & Containers Icon */}
                <g transform="translate(322, 24)">
                  {/* Container blocks */}
                  <rect x="8" y="10" width="6" height="5.5" rx="1" fill="#f4cb6e" />
                  <rect x="15.5" y="10" width="6" height="5.5" rx="1" fill="#f4cb6e" />
                  <rect x="23" y="10" width="6" height="5.5" rx="1" fill="#f4cb6e" />
                  <rect x="15.5" y="3" width="6" height="5.5" rx="1" fill="#f4cb6e" />
                  <rect x="23" y="3" width="6" height="5.5" rx="1" fill="#f4cb6e" />
                  <rect x="30.5" y="10" width="6" height="5.5" rx="1" fill="#f4cb6e" />
                  {/* Whale body */}
                  <path
                    d="M3 18.5H39C40.5 16 42.5 14.5 45.5 15C44.5 18 42.8 20.2 40.2 21.2C38.5 29.5 30.5 34 20 34C9.5 34 3 28.5 3 18.5Z"
                    fill="url(#whaleGrad)"
                  />
                  <defs>
                    <linearGradient id="whaleGrad" x1="3" y1="15" x2="42" y2="34" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#fae094" />
                      <stop offset="1" stopColor="#c78b24" />
                    </linearGradient>
                  </defs>
                </g>
              </g>
            </svg>
          </div>
        </section>

        {/* RIGHT COLUMN: AUTHENTICATION CARD */}
        <section className="auth-right-column">
          <div className="auth-card">
            {/* Top Segmented Pill Switcher */}
            <div className="auth-segmented-tabs">
              <button
                type="button"
                className={`auth-seg-btn ${mode === 'signin' ? 'active' : ''}`}
                onClick={() => {
                  setMode('signin');
                  setErrorMsg('');
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`auth-seg-btn ${mode === 'register' ? 'active' : ''}`}
                onClick={() => {
                  setMode('register');
                  setErrorMsg('');
                }}
              >
                Create Account
              </button>
            </div>

            <h2 className="auth-card-heading">
              {mode === 'signin' ? 'Enter workspace' : 'Create engineer account'}
            </h2>

            {errorMsg && <div className="auth-error-banner">{errorMsg}</div>}

            <form className="auth-form" onSubmit={handleSubmit}>
              {mode === 'register' && (
                <div className="auth-field-group">
                  <label className="auth-label">Full Name</label>
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="Engineer Name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
              )}

              <div className="auth-field-group">
                <label className="auth-label">Email or Username</label>
                <input
                  type="text"
                  className="auth-input"
                  placeholder="Email or Username"
                  autoComplete="off"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>

              <div className="auth-field-group">
                <label className="auth-label">Password</label>
                <input
                  type="password"
                  className="auth-input"
                  placeholder="Enter your password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading
                  ? 'Authenticating...'
                  : mode === 'signin'
                  ? 'Authenticate & Enter Workspace ▶'
                  : 'Register & Enter Workspace ▶'}
              </button>
            </form>

            {/* Quick Access Divider */}
            <div className="auth-divider">
              <span className="auth-divider-line" />
              <span className="auth-divider-text">Quick Access</span>
              <span className="auth-divider-line" />
            </div>

            {/* Dashed 1-Click Guest Demo Button */}
            <button type="button" className="auth-guest-btn" onClick={handleGuestDemo}>
              <span className="bolt-icon">⚡</span> Continue as Guest (1-Click Demo) ▶
            </button>

            {/* Remember Session & Forgot Password Row */}
            <div className="auth-footer-row">
              <label className="auth-remember-label">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span className="custom-checkbox" />
                <span>Remember session</span>
              </label>

              <a
                href="#forgot"
                className="auth-forgot-link"
                onClick={(e) => {
                  e.preventDefault();
                  handleGuestDemo();
                }}
              >
                Forgot Password?
              </a>
            </div>
          </div>

          {/* Subtle 4-Point Star Sparkle Next to Card */}
          
        </section>
      </div>

      {/* ================= BOTTOM-LEFT 3D GOLDEN WIREFRAME WAVE MESH ================= */}
      <div className="auth-bottom-wave-wrap">
        <div className="auth-wave-glow" />
        <svg viewBox="0 0 760 220" preserveAspectRatio="none" className="auth-wave-svg">
          {wireframeMesh.horizontalPaths.map((p, idx) => (
            <path
              key={`h-${idx}`}
              d={p.d}
              fill="none"
              stroke="#e5b24c"
              strokeWidth="0.95"
              strokeOpacity={p.opacity}
            />
          ))}
          {wireframeMesh.crossPaths.map((p, idx) => (
            <path
              key={`c-${idx}`}
              d={p.d}
              fill="none"
              stroke="#d49b35"
              strokeWidth="0.75"
              strokeOpacity={p.opacity}
            />
          ))}
        </svg>
      </div>

      {/* ================= BOTTOM-RIGHT AMBIENT GOLD ORB ================= */}
      <div className="auth-corner-orb" />
    </div>
  );
}