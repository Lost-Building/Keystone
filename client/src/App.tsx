import React, { useState, useEffect } from 'react';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const IS_PUBLIC_DEMO = window.location.hostname.endsWith('github.io');
const DEMO_TOKEN = 'keystone-public-demo-token';

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
  const [marketplace, setMarketplace] = useState<MarketplaceListing[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | 'newest'>('newest');

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: LibraryItem | null } | null>(null);
  const [sellModal, setSellModal] = useState<LibraryItem | null>(null);
  const [sellPrice, setSellPrice] = useState<string>('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [token, setToken] = useState(() => localStorage.getItem('authToken') || '');
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
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

  const handleBuy = async (listing: MarketplaceListing) => {
    if (IS_PUBLIC_DEMO) {
      alert(`Demo mode: Stripe Checkout would open for ${listing.game.title} at $${listing.salePrice.toFixed(2)} once the backend is hosted.`);
      return;
    }

    try {
      const response = await apiFetch('/api/checkout/marketplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId: listing.keyId
        })
      });
      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Could not start checkout');
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Failed to start checkout', error);
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

  if (!token || !currentUser) {
    return (
      <div className="app-container">
        <div className="public-store-shell">
          <section className="store-hero public-store-hero">
            <div className="store-hero-copy">
              <span className="store-kicker">KeyStone Store</span>
              <h1>Start in the Store</h1>
              <p>Buy games, trade player-owned keys, and build a console-style avatar with outfits, emotes, profile rooms, and collectible drops.</p>
              <div className="avatar-items public-avatar-items">
                {[
                  ['Arcade Pilot Set', 'Featured outfit', '$4.99'],
                  ['Victory Spin', 'Emote', '$1.49'],
                  ['Neon Room Kit', 'Profile space', '$5.99']
                ].map(([name, type, price]) => (
                  <div className="avatar-item" key={name}>
                    <span className="item-swatch"></span>
                    <span>
                      <strong>{name}</strong>
                      <small>{type}</small>
                    </span>
                    <b>{price}</b>
                  </div>
                ))}
              </div>
            </div>

            <aside className="avatar-showcase" aria-label="Avatar preview and featured items">
              <div className="avatar-card">
                <div className="avatar-stage">
                  <div className="avatar-shadow"></div>
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
                </div>
                <div className="avatar-profile">
                  <div>
                    <span className="profile-label">Player Preview</span>
                    <strong>{authMode === 'register' ? 'Create your avatar' : 'Welcome back'}</strong>
                  </div>
                  <span className="profile-price">Store</span>
                </div>
              </div>
            </aside>
          </section>

          <form className="auth-panel" onSubmit={handleAuthSubmit}>
            <h1>KeyStone</h1>
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
            <button type="submit" className="btn-primary">{authMode === 'login' ? 'Login' : 'Create Account'}</button>
            <p className="auth-note">Demo developer login: gamer@example.com / ChangeMe123!</p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container" onClick={closeContextMenu}>
      <div className="titlebar">
        <div className="titlebar-drag-region"></div>
        <div className="titlebar-title">KeyStone Desktop</div>
        <div className="titlebar-controls">
          <button onClick={logout}>Logout</button>
          <button onClick={() => window.keystone?.minimize()}>—</button>
          <button onClick={() => window.keystone?.maximize()}>□</button>
          <button className="close-btn" onClick={() => window.keystone?.close()}>✕</button>
        </div>
      </div>
      <nav className="top-nav">
        <div className="nav-brand">KeyStone</div>
        <div className="nav-tabs">
          <button 
            className={`nav-btn ${activeTab === 'library' ? 'active' : ''}`}
            onClick={() => setActiveTab('library')}
          >
            My Library
          </button>
          <button 
            className={`nav-btn ${activeTab === 'marketplace' ? 'active' : ''}`}
            onClick={() => setActiveTab('marketplace')}
          >
            Store
          </button>
          <button 
            className={`nav-btn ${activeTab === 'developer' ? 'active' : ''}`}
            onClick={() => setActiveTab('developer')}
          >
            Developer Portal
          </button>
        </div>
      </nav>

      <div className="content-area">
        {activeTab === 'library' && (
          <div className="library-view">
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
            <div className="store-front">
              <section className="store-hero">
                <div className="store-hero-copy">
                  <span className="store-kicker">KeyStone Store</span>
                  <h1>Games, gear, and your player identity in one place</h1>
                  <p>Buy new releases, trade player-owned keys, and build an avatar that feels like the classic console era with a KeyStone twist.</p>
                  <div className="store-actions">
                    <button className="btn-primary" onClick={() => document.getElementById('store-games')?.scrollIntoView({ behavior: 'smooth' })}>Browse Games</button>
                    <button className="btn-secondary" onClick={() => alert('Avatar customization shop coming soon.')}>Customize Avatar</button>
                  </div>
                </div>

                <aside className="avatar-showcase" aria-label="Avatar preview and featured items">
                  <div className="avatar-card">
                    <div className="avatar-stage">
                      <div className="avatar-shadow"></div>
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
                    </div>
                    <div className="avatar-profile">
                      <div>
                        <span className="profile-label">Today&apos;s Avatar Drop</span>
                        <strong>Arcade Pilot Set</strong>
                      </div>
                      <span className="profile-price">$4.99</span>
                    </div>
                  </div>
                </aside>
              </section>

              <section className="avatar-market">
                <div className="avatar-market-copy">
                  <span className="store-kicker">Avatar Market</span>
                  <h2>Make identity sellable</h2>
                  <p>Outfits, animated emotes, room props, profile poses, and collectible badges can live beside games as store inventory.</p>
                </div>
                <div className="avatar-items">
                  {[
                    ['Holo Hoodie', 'Rare jacket', '$2.99'],
                    ['Victory Spin', 'Emote', '$1.49'],
                    ['Neon Room Kit', 'Profile space', '$5.99']
                  ].map(([name, type, price]) => (
                    <button type="button" className="avatar-item" key={name} onClick={() => alert(`${name} preview coming soon.`)}>
                      <span className="item-swatch"></span>
                      <span>
                        <strong>{name}</strong>
                        <small>{type}</small>
                      </span>
                      <b>{price}</b>
                    </button>
                  ))}
                </div>
              </section>
            </div>
            
            <div className="marketplace-controls" id="store-games" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
              <input 
                type="text" 
                placeholder="Search games..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1, padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid rgba(102, 252, 241, 0.3)', background: 'rgba(31, 40, 51, 0.5)', color: 'white', outline: 'none' }}
              />
              <select 
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc' | 'newest')}
                style={{ padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid rgba(102, 252, 241, 0.3)', background: 'rgba(31, 40, 51, 0.5)', color: 'white', outline: 'none' }}
              >
                <option value="newest">Newest Listings</option>
                <option value="asc">Price: Low to High</option>
                <option value="desc">Price: High to Low</option>
              </select>
            </div>

            <div className="games-grid">
              {marketplace
                .filter(listing => listing.game.title.toLowerCase().includes(searchQuery.toLowerCase()))
                .sort((a, b) => {
                  if (sortOrder === 'asc') return a.salePrice - b.salePrice;
                  if (sortOrder === 'desc') return b.salePrice - a.salePrice;
                  return 0; // newest is default order from backend mock
                })
                .map((listing) => (
                <div key={listing.keyId} className="game-card marketplace-card">
                  <div className="game-image-container">
                    {listing.game.image ? (
                      <img src={listing.game.image} alt={listing.game.title} className="game-thumbnail" />
                    ) : (
                      <div className="image-placeholder">No Image</div>
                    )}
                  </div>
                  <div className="game-info">
                    <div className="game-title">{listing.game.title}</div>
                    <div className="game-dev" style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{listing.game.developer}</span>
                      {listing.game.genre && <span style={{ background: 'rgba(102, 252, 241, 0.2)', color: '#66fcf1', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>{listing.game.genre}</span>}
                    </div>
                    <div className="marketplace-actions">
                      <span className="price">${listing.salePrice.toFixed(2)}</span>
                      {listing.sellerId === currentUser.id ? (
                        <button className="btn-secondary" disabled>Your Listing</button>
                      ) : (
                        <button className="btn-primary" onClick={() => handleBuy(listing)}>Buy Key</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'developer' && (
          <div className="developer-view">
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
