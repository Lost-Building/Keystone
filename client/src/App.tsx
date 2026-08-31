import React, { useState, useEffect } from 'react';
import './App.css';

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
  const [activeTab, setActiveTab] = useState<'library' | 'marketplace' | 'developer'>('library');
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

    const response = await fetch(`http://localhost:3001${path}`, {
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
    if (activeTab === 'library') {
      fetchLibrary();
    } else if (activeTab === 'marketplace') {
      fetchMarketplace();
    }
  }, [activeTab]);

  const fetchLibrary = async () => {
    try {
      const response = await apiFetch('/api/library/me');
      const data = await response.json();
      setLibrary(data);
    } catch (error) {
      console.error('Failed to fetch library', error);
    }
  };

  const fetchMarketplace = async () => {
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
          email: formData.get('email'),
          password: formData.get('password')
        };

    try {
      const response = await fetch(`http://localhost:3001/api/auth/${authMode}`, {
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
        <div className="auth-shell">
          <form className="auth-panel" onSubmit={handleAuthSubmit}>
            <h1>KeyStone</h1>
            <div className="auth-tabs">
              <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Login</button>
              <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Register</button>
            </div>
            {authMode === 'register' && (
              <input name="username" placeholder="Username" required maxLength={32} />
            )}
            <input name="email" type="email" placeholder="Email" required />
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
            Marketplace
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
            <div className="marketplace-hero">
              <h2>Discover & Trade</h2>
              <p>Welcome to the KeyStone Marketplace. Buy keys directly from other players securely. Every sale supports the original developers through automated smart contract royalties.</p>
            </div>
            
            <div className="marketplace-controls" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
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
