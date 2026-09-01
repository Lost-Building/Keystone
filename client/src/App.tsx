import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const IS_PUBLIC_DEMO = window.location.hostname.endsWith('github.io') || new URLSearchParams(window.location.search).has('demo');
const DEMO_TOKEN = 'keystone-public-demo-token';
const AVATAR_IMAGE_KEY = 'keystoneAvatarImage';
const AVATAR_ANIMATION_KEY = 'keystoneAvatarAnimation';

type AvatarAnimation = 'idle' | 'wave' | 'hop' | 'spin' | 'power';

const avatarAnimations: { id: AvatarAnimation; label: string }[] = [
  { id: 'idle', label: 'Idle' },
  { id: 'wave', label: 'Wave' },
  { id: 'hop', label: 'Hop' },
  { id: 'spin', label: 'Spin' },
  { id: 'power', label: 'Power' }
];

const demoUser: CurrentUser = {
  id: 'user1',
  username: 'Gamer123',
  email: 'gamer@example.com',
  role: 'developer'
};

const demoMarketplace: MarketplaceListing[] = [
  {
    keyId: 'demo-epic-quest',
    sellerId: 'randomUser1',
    salePrice: 12.99,
    game: {
      id: 'game1',
      title: 'Epic Quest',
      developer: 'DevStudio',
      price: 19.99,
      image: '/Keystone/epic_quest.jpg',
      genre: 'RPG'
    }
  },
  {
    keyId: 'demo-space-explorer',
    sellerId: 'randomUser2',
    salePrice: 7.49,
    game: {
      id: 'game2',
      title: 'Space Explorer',
      developer: 'Cosmic Games',
      price: 9.99,
      image: '/Keystone/space_explorer.jpg',
      genre: 'Sci-Fi'
    }
  },
  {
    keyId: 'demo-cyber-city',
    sellerId: 'randomUser3',
    salePrice: 18.5,
    game: {
      id: 'game3',
      title: 'Cyber City',
      developer: 'Neon Inc',
      price: 29.99,
      genre: 'Action'
    }
  }
];

const demoLibrary: LibraryItem[] = [
  {
    keyId: 'key-123',
    isListedForSale: false,
    game: demoMarketplace[0].game
  },
  {
    keyId: 'key-456',
    isListedForSale: false,
    game: demoMarketplace[1].game
  }
];

interface Game {
  id: string;
  title: string;
  developer: string;
  price: number;
  image?: string;
  genre?: string;
}

interface LibraryItem {
  keyId: string;
  game: Game;
  isListedForSale: boolean;
  salePrice?: number;
}

interface MarketplaceListing {
  keyId: string;
  game: Game;
  sellerId: string;
  salePrice: number;
}

interface CurrentUser {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'developer' | 'admin';
}

function App() {
  const [activeTab, setActiveTab] = useState<'library' | 'marketplace' | 'developer'>('marketplace');
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [, setMarketplace] = useState<MarketplaceListing[]>([]);
  const [activeDashboardCard, setActiveDashboardCard] = useState(0);
  const [customAvatar, setCustomAvatar] = useState(() => localStorage.getItem(AVATAR_IMAGE_KEY) || '');
  const [avatarAnimation, setAvatarAnimation] = useState<AvatarAnimation>(() => {
    const savedAnimation = localStorage.getItem(AVATAR_ANIMATION_KEY);
    const matchingAnimation = avatarAnimations.find((animation) => animation.id === savedAnimation);
    return matchingAnimation?.id || 'idle';
  });
  const avatarInputRef = useRef<HTMLInputElement>(null);
  
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: LibraryItem | null } | null>(null);
  const [sellModal, setSellModal] = useState<LibraryItem | null>(null);
  const [sellPrice, setSellPrice] = useState<string>('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [token, setToken] = useState(() => IS_PUBLIC_DEMO ? DEMO_TOKEN : (localStorage.getItem('authToken') || ''));
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => IS_PUBLIC_DEMO ? demoUser : null);
  const [authError, setAuthError] = useState('');

  const apiFetch = async (path: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers
    });

    if (response.status === 401) {
      localStorage.removeItem('authToken');
      setToken('');
      setCurrentUser(null);
    }

    return response;
  };

  useEffect(() => {
    if (!token) return;

    if (IS_PUBLIC_DEMO && token === DEMO_TOKEN) {
      setCurrentUser(demoUser);
      setMarketplace(demoMarketplace);
      return;
    }

    apiFetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) throw new Error('Session expired');
        const data = await response.json();
        setCurrentUser(data.user);
      })
      .catch(() => {
        localStorage.removeItem('authToken');
        setToken('');
        setCurrentUser(null);
      });
  }, [token]);

  useEffect(() => {
    if (!currentUser) return;

    if (activeTab === 'library') {
      fetchLibrary();
    } else if (activeTab === 'marketplace') {
      fetchMarketplace();
    }
  }, [activeTab, currentUser]);

  const fetchLibrary = async () => {
    if (IS_PUBLIC_DEMO) {
      setLibrary(demoLibrary);
      return;
    }

    try {
      const response = await apiFetch('/api/library/me');
      const data = await response.json();
      setLibrary(data);
    } catch (error) {
      console.error('Failed to fetch library', error);
    }
  };

  const fetchMarketplace = async () => {
    if (IS_PUBLIC_DEMO) {
      setMarketplace(demoMarketplace);
      return;
    }

    try {
      const response = await apiFetch('/api/marketplace');
      const data = await response.json();
      setMarketplace(data);
    } catch (error) {
      console.error('Failed to fetch marketplace', error);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, item: LibraryItem) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const handleSellClick = () => {
    if (contextMenu?.item) {
      setSellModal(contextMenu.item);
    }
    closeContextMenu();
  };

  const handleExportClick = () => {
    if (contextMenu?.item) {
      alert(`Exporting ${contextMenu.item.game.title} to ISO format for disk burning... \n\n(Simulated: creating DRM-free bundle)`);
    }
    closeContextMenu();
  };

  const submitSell = async () => {
    if (!sellModal || !sellPrice) return;

    if (IS_PUBLIC_DEMO) {
      alert('Demo mode: this would list your game on the live marketplace once the backend is hosted.');
      setSellModal(null);
      setSellPrice('');
      return;
    }

    try {
      const response = await apiFetch('/api/marketplace/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: sellModal.keyId,
          price: parseFloat(sellPrice)
        })
      });

      if (response.ok) {
        alert('Game listed on marketplace successfully!');
        setSellModal(null);
        setSellPrice('');
        fetchLibrary(); // Refresh library
      }
    } catch (error) {
      console.error('Failed to list game', error);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError('');

    const formData = new FormData(e.currentTarget);
    const body = authMode === 'register'
      ? {
          username: formData.get('username'),
          email: formData.get('email'),
          password: formData.get('password')
        }
      : {
          identifier: formData.get('email'),
          password: formData.get('password')
        };

    if (IS_PUBLIC_DEMO) {
      localStorage.setItem('authToken', DEMO_TOKEN);
      setToken(DEMO_TOKEN);
      setCurrentUser(demoUser);
      setMarketplace(demoMarketplace);
      setActiveTab('marketplace');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();

      if (!response.ok) {
        setAuthError(data.error || 'Authentication failed');
        return;
      }

      localStorage.setItem('authToken', data.token);
      setToken(data.token);
      setCurrentUser(data.user);
      setActiveTab('marketplace');
    } catch {
      setAuthError('Could not reach KeyStone backend');
    }
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setToken('');
    setCurrentUser(null);
    setLibrary([]);
    setMarketplace([]);
  };

  const enterPublicDemo = () => {
    localStorage.setItem('authToken', DEMO_TOKEN);
    setToken(DEMO_TOKEN);
    setCurrentUser(demoUser);
    setMarketplace(demoMarketplace);
    setActiveTab('marketplace');
  };

  const openAvatarUpload = () => {
    avatarInputRef.current?.click();
  };

  const resizeAvatarImage = (file: File) => new Promise<string>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const maxSize = 520;
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');

      URL.revokeObjectURL(objectUrl);

      if (!context) {
        reject(new Error('Canvas unavailable'));
        return;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image could not be loaded'));
    };

    image.src = objectUrl;
  });

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    try {
      const avatarData = await resizeAvatarImage(file);
      localStorage.setItem(AVATAR_IMAGE_KEY, avatarData);
      setCustomAvatar(avatarData);
      setAvatarAnimation('idle');
      localStorage.setItem(AVATAR_ANIMATION_KEY, 'idle');
    } catch {
      alert('Could not use that avatar image. Try a PNG or JPG.');
    } finally {
      event.currentTarget.value = '';
    }
  };

  const selectAvatarAnimation = (animation: AvatarAnimation) => {
    setAvatarAnimation(animation);
    localStorage.setItem(AVATAR_ANIMATION_KEY, animation);
  };

  const renderAvatarControls = () => (
    <div className="avatar-card-controls" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <button type="button" className="avatar-upload-button" onClick={openAvatarUpload}>
        Upload Avatar
      </button>
      <div className="avatar-animation-row" aria-label="Avatar animations">
        {avatarAnimations.map((animation) => (
          <button
            type="button"
            className={animation.id === avatarAnimation ? 'active' : ''}
            key={animation.id}
            onClick={() => selectAvatarAnimation(animation.id)}
          >
            {animation.label}
          </button>
        ))}
      </div>
    </div>
  );

  const dashboardCards = [
    {
      label: 'Store',
      icon: 'controller',
      action: () => alert('Store home selected.')
    },
    {
      label: 'Library',
      icon: 'disc',
      action: () => setActiveTab('library')
    },
    {
      label: 'Developer',
      icon: 'upload-dot',
      action: () => setActiveTab('developer')
    },
    {
      label: 'Avatar',
      icon: 'avatar-dot',
      action: openAvatarUpload
    },
    {
      label: 'Deals',
      icon: 'deal-dot',
      action: () => alert('Deals refresh daily in the Store.')
    }
  ];

  const publicDashboardCards = [
    {
      label: 'Store',
      icon: 'controller',
      action: enterPublicDemo
    },
    {
      label: 'Create Profile',
      icon: 'upload-dot',
      action: () => setAuthMode('register')
    },
    {
      label: 'Avatar',
      icon: 'avatar-dot',
      action: openAvatarUpload
    },
    {
      label: 'Deals',
      icon: 'deal-dot',
      action: () => alert('Deals refresh daily in the Store.')
    }
  ];

  const moveDashboardCard = (direction: -1 | 1, cardCount: number) => {
    setActiveDashboardCard((current) => (current + direction + cardCount) % cardCount);
  };

  const dashboardCardCount = currentUser ? dashboardCards.length : publicDashboardCards.length;

  useEffect(() => {
    const handleDashboardKeys = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        setActiveDashboardCard((current) => (current - 1 + dashboardCardCount) % dashboardCardCount);
      } else if (event.key === 'ArrowRight') {
        setActiveDashboardCard((current) => (current + 1) % dashboardCardCount);
      } else {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener('keydown', handleDashboardKeys);
    return () => window.removeEventListener('keydown', handleDashboardKeys);
  }, [dashboardCardCount]);

  const dashboardAvatar = (
      <div className="avatar-card dashboard-avatar-card">
      <div className="avatar-stage">
        <div className="avatar-shadow"></div>
        <div className={`avatar-actor avatar-motion-${avatarAnimation}`}>
          {customAvatar ? (
            <img className="uploaded-avatar-image" src={customAvatar} alt="Custom avatar" />
          ) : (
            <div className="avatar-body">
              <div className="avatar-head">
                <span className="avatar-hair"></span>
                <span className="avatar-eye left"></span>
                <span className="avatar-eye right"></span>
                <span className="avatar-smile"></span>
              </div>
              <div className="avatar-torso">
                <span className="avatar-jacket"></span>
              </div>
              <div className="avatar-legs"></div>
            </div>
          )}
        </div>
      </div>
      <div className="avatar-profile">
        <div>
          <span className="profile-label">Player Preview</span>
          <strong>{currentUser?.username || (authMode === 'register' ? 'Create your avatar' : 'Welcome back')}</strong>
        </div>
        <span className="profile-price">1280G</span>
      </div>
    </div>
  );

  if (!token || !currentUser) {
    return (
      <div className="app-container">
        <input ref={avatarInputRef} className="avatar-file-input" type="file" accept="image/*" onChange={handleAvatarUpload} />
        <div className="xbox-shell public-xbox-shell public-nxe-shell">
          <main className="blade-dashboard nxe-dashboard">
            <aside className="blade-rail left-blades" aria-label="Left blades">
              <span>marketplace</span>
              <span className="active">store</span>
              <span>library</span>
            </aside>
            <section className="blade-stage">
              <div className="blade-titlebar nxe-titlebar">
                <span>Sign In</span>
                <strong>KeyStone LIVE</strong>
              </div>
              <section className="nxe-scene public-nxe-scene">
                <div className="nxe-profile-card public-signin-card">
                  <form className="nxe-signin-form" onSubmit={handleAuthSubmit}>
                    <strong>KeyStone Profile</strong>
                    <div className="auth-tabs">
                      <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Login</button>
                      <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Register</button>
                    </div>
                    {authMode === 'register' && (
                      <input name="username" placeholder="Username" required maxLength={32} />
                    )}
                    <input name="email" type={authMode === 'register' ? 'email' : 'text'} placeholder={authMode === 'register' ? 'Email' : 'Email or username'} required />
                    <input name="password" type="password" placeholder="Password" required minLength={12} autoComplete="current-password" />
                    {authError && <div className="auth-error">{authError}</div>}
                    <button type="submit" className="btn-primary">{authMode === 'login' ? 'Sign In' : 'Create Profile'}</button>
                  </form>
                </div>

                <div className="nxe-avatar-stand">
                  {dashboardAvatar}
                </div>

                <div className="nxe-card-stack" aria-label="Dashboard menu">
                  {publicDashboardCards.map((card, index) => {
                    const offset = (index - activeDashboardCard + publicDashboardCards.length) % publicDashboardCards.length;
                    return (
                      <div
                        role="button"
                        tabIndex={0}
                        className={`nxe-menu-card ${index === activeDashboardCard ? 'active' : ''} ${card.label === 'Avatar' && index === activeDashboardCard ? 'avatar-controls-open' : ''}`}
                        style={{
                          '--card-offset': offset,
                          '--card-depth': offset,
                          zIndex: 20 - offset
                        } as React.CSSProperties}
                        key={card.label}
                        onClick={() => index === activeDashboardCard ? card.action() : setActiveDashboardCard(index)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          index === activeDashboardCard ? card.action() : setActiveDashboardCard(index);
                        }}
                      >
                        <span className={`nxe-controller ${card.icon === 'controller' ? '' : card.icon}`}></span>
                        <strong>{card.label}</strong>
                        {card.label === 'Avatar' && index === activeDashboardCard && renderAvatarControls()}
                      </div>
                    );
                  })}
                </div>

                <div className="nxe-hints">
                  <span>A Select</span>
                  <button type="button" onClick={() => moveDashboardCard(-1, publicDashboardCards.length)}>&lt; Previous</button>
                  <button type="button" onClick={() => moveDashboardCard(1, publicDashboardCards.length)}>Next &gt;</button>
                </div>
              </section>
            </section>
            <aside className="blade-rail right-blades" aria-label="Right blades">
              <span>games</span>
              <span>avatars</span>
              <span>system</span>
            </aside>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container" onClick={closeContextMenu}>
      <input ref={avatarInputRef} className="avatar-file-input" type="file" accept="image/*" onChange={handleAvatarUpload} />
      <div className="titlebar">
        <div className="titlebar-drag-region"></div>
        <div className="titlebar-title">KeyStone Desktop</div>
        <div className="titlebar-controls">
          <button onClick={logout}>Logout</button>
          <button className="settings-btn" title="Settings" aria-label="Settings" onClick={() => alert('Settings coming soon.')}>⚙</button>
        </div>
      </div>
      <div className={`content-area ${activeTab === 'marketplace' ? 'store-content-area' : ''}`}>
        {activeTab === 'library' && (
          <div className="library-view">
            <button className="btn-secondary back-to-store" onClick={() => setActiveTab('marketplace')}>Back to Store</button>
            <h1>My Library</h1>
            <p className="hint-text">💡 Tip: Right-click (or left-click) a game to see options like Sell or Export.</p>
            
            <div className="games-grid">
              {library.map((item) => (
                <div 
                  key={item.keyId} 
                  className="game-card"
                  onContextMenu={(e) => handleContextMenu(e, item)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleContextMenu(e, item);
                  }}
                >
                  <div className="game-image-container">
                    {item.game.image ? (
                      <img src={item.game.image} alt={item.game.title} className="game-thumbnail" />
                    ) : (
                      <div className="image-placeholder">No Image</div>
                    )}
                  </div>
                  {item.isListedForSale && <div className="status-badge">LISTED (${item.salePrice})</div>}
                  <div className="game-info">
                    <div className="game-title">{item.game.title}</div>
                    <div className="game-dev" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{item.game.developer}</span>
                      {item.game.genre && <span style={{ background: 'rgba(102, 252, 241, 0.2)', color: '#66fcf1', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>{item.game.genre}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'marketplace' && (
          <div className="marketplace-view">
            <div className="xbox-shell dashboard-store-shell">
              <main className="blade-dashboard nxe-dashboard">
                <aside className="blade-rail left-blades" aria-label="Left blades">
                  <span>marketplace</span>
                  <span className="active">store</span>
                  <span>library</span>
                </aside>
                <section className="blade-stage">
                  <div className="blade-titlebar nxe-titlebar">
                    <span>{currentUser.username}</span>
                    <strong>KeyStone LIVE</strong>
                  </div>
                  <section className="nxe-scene nxe-menu-only-scene">
                    <div className="nxe-avatar-stand">
                      {dashboardAvatar}
                    </div>

                    <div className="nxe-card-stack" aria-label="Dashboard menu">
                      {dashboardCards.map((card, index) => {
                        const offset = (index - activeDashboardCard + dashboardCards.length) % dashboardCards.length;
                        return (
                          <div
                            role="button"
                            tabIndex={0}
                            className={`nxe-menu-card ${index === activeDashboardCard ? 'active' : ''} ${card.label === 'Avatar' && index === activeDashboardCard ? 'avatar-controls-open' : ''}`}
                            style={{
                              '--card-offset': offset,
                              '--card-depth': offset,
                              zIndex: 20 - offset
                            } as React.CSSProperties}
                            key={card.label}
                            onClick={() => index === activeDashboardCard ? card.action() : setActiveDashboardCard(index)}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') return;
                              event.preventDefault();
                              index === activeDashboardCard ? card.action() : setActiveDashboardCard(index);
                            }}
                          >
                            <span className={`nxe-controller ${card.icon === 'controller' ? '' : card.icon}`}></span>
                            <strong>{card.label}</strong>
                            {card.label === 'Avatar' && index === activeDashboardCard && renderAvatarControls()}
                          </div>
                        );
                      })}
                    </div>

                    <div className="nxe-hints">
                      <span><b>A</b> Select</span>
                      <button type="button" aria-label="Previous dashboard card" onClick={() => moveDashboardCard(-1, dashboardCards.length)}>&#9664;</button>
                      <button type="button" aria-label="Next dashboard card" onClick={() => moveDashboardCard(1, dashboardCards.length)}>&#9654;</button>
                    </div>
                  </section>
                </section>
                <aside className="blade-rail right-blades" aria-label="Right blades">
                  <span>games</span>
                  <span>avatars</span>
                  <span>system</span>
                </aside>
              </main>
            </div>
          </div>
        )}
        {activeTab === 'developer' && (
          <div className="developer-view">
            <button className="btn-secondary back-to-store" onClick={() => setActiveTab('marketplace')}>Back to Store</button>
            <h1>Developer Portal</h1>
            <p className="hint-text">Upload your game to KeyStone. Set your own price, and receive automatic royalties from every secondary market sale.</p>
            
            <div style={{ background: 'rgba(31, 40, 51, 0.7)', padding: '2rem', borderRadius: '12px', border: '1px solid rgba(102, 252, 241, 0.2)', maxWidth: '600px' }}>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                const data = {
                  title: formData.get('title'),
                  developer: formData.get('developer'),
                  price: formData.get('price'),
                  genre: formData.get('genre')
                };
                try {
                  const res = await apiFetch('/api/developer/upload', {
                    method: 'POST',
                    body: JSON.stringify(data)
                  });
                  if (res.ok) {
                    alert('Game uploaded to catalog successfully!');
                    (e.target as HTMLFormElement).reset();
                  } else {
                    const error = await res.json().catch(() => ({ error: 'Upload failed' }));
                    alert(error.error || 'Upload failed');
                  }
                } catch (err) {
                  console.error(err);
                }
              }}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#c5c6c7' }}>Game Title</label>
                  <input name="title" required style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }} />
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: '#c5c6c7' }}>Studio Name</label>
                  <input name="developer" required style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }} />
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#c5c6c7' }}>Retail Price ($)</label>
                    <input name="price" type="number" step="0.01" required style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: '#c5c6c7' }}>Genre</label>
                    <input name="genre" style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }} />
                  </div>
                </div>
                <div style={{ marginBottom: '2rem', padding: '1rem', background: '#0b0c10', borderRadius: '8px', border: '1px dashed #66fcf1' }}>
                  <p style={{ color: '#66fcf1', margin: 0, textAlign: 'center' }}>Drag and drop game files (mocked)</p>
                </div>
                <button type="submit" className="btn-primary" style={{ width: '100%' }}>Upload & Mint Keys</button>
              </form>
            </div>
          </div>
        )}
      </div>

      {contextMenu && contextMenu.item && (
        <div 
          className="context-menu" 
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div className="context-menu-item" onClick={() => { alert('Launching game...'); closeContextMenu(); }}>Play</div>
          <div className="context-menu-item" onClick={() => { alert('Installing game...'); closeContextMenu(); }}>Install</div>
          <div className="context-menu-divider"></div>
          {!contextMenu.item.isListedForSale && (
            <div className="context-menu-item" onClick={handleSellClick}>Sell on Marketplace</div>
          )}
          <div className="context-menu-item" onClick={handleExportClick}>Export to ISO (Disk)</div>
        </div>
      )}

      {sellModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Sell {sellModal.game.title}</h2>
            <p>List your key on the marketplace. True ownership means you control the price.</p>
            <input 
              type="number" 
              placeholder="Sale Price ($)" 
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
            />
            {sellPrice && !isNaN(parseFloat(sellPrice)) && (
              <div className="fee-breakdown" style={{ background: '#1e1e24', padding: '1rem', borderRadius: '4px', fontSize: '0.9rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a0a0a0' }}>
                  <span>Developer Royalty (10%):</span>
                  <span>${(parseFloat(sellPrice) * 0.10).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a0a0a0' }}>
                  <span>Platform Fee (5%):</span>
                  <span>${(parseFloat(sellPrice) * 0.05).toFixed(2)}</span>
                </div>
                <hr style={{ borderColor: '#333', margin: '0.5rem 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2ecc71', fontWeight: 'bold' }}>
                  <span>You Receive:</span>
                  <span>${(parseFloat(sellPrice) * 0.85).toFixed(2)}</span>
                </div>
              </div>
            )}
            <p style={{ fontSize: '0.8rem', color: '#a0a0a0', marginTop: '0' }}>* A portion of every resale goes directly to the original developers, supporting them even on the secondary market!</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setSellModal(null); setSellPrice(''); }}>Cancel</button>
              <button className="btn-primary" onClick={submitSell} disabled={!sellPrice || isNaN(parseFloat(sellPrice)) || parseFloat(sellPrice) <= 0}>Confirm Listing</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
