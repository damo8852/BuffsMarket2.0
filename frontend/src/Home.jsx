// src/Home.jsx
import React, { useEffect, useState, useMemo } from 'react';
import './styles/Home.css';
import Login from './components/Login';
import Register from './components/Register';

const GRAPHQL_ENDPOINT = 'http://localhost:8000/graphql/';

async function graphQLRequest(query, variables = {}) {
  const token = localStorage.getItem('authToken');
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
    credentials: 'include',
  });
  const json = await res.json();
  if (json.errors) {
    const message = json.errors.map(e => e.message).join('; ');
    throw new Error(message);
  }
  return json.data;
}

async function uploadImageToGCS(file) {
  const getUrlMutation = `
    mutation($filename: String!, $ct: String!) {
      generateListingImageUploadUrl(filename: $filename, contentType: $ct) {
        signedUrl
        publicUrl
      }
    }
  `;
  const data = await graphQLRequest(getUrlMutation, { filename: file.name, ct: file.type || 'application/octet-stream' });
  const { signedUrl, publicUrl } = data.generateListingImageUploadUrl;

  const putRes = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status} ${putRes.statusText}`);
  return publicUrl;
}

const queries = {
  list: `
    query($search: String, $includeSold: Boolean) {
      listings(search: $search, includeSold: $includeSold) {
        id
        title
        description
        price
        sold
        dateListed
        user { id username }
        images { id imageUrl }
      }
    }
  `,
};

const mutations = {
  create: `
    mutation($title: String!, $description: String!, $price: Decimal!, $imageUrls: [String!]) {
      createListing(title: $title, description: $description, price: $price, imageUrls: $imageUrls) {
        success
        message
        listing {
          id title description price sold
          images { id imageUrl }
        }
      }
    }
  `,
  setSold: `
    mutation($id: ID!, $sold: Boolean!) {
      setListingSold(id: $id, sold: $sold) {
        success
        message
        listing { id sold }
      }
    }
  `,
  updateAddRemove: `
    mutation($id: ID!, $add: [String!], $remove: [Int!]) {
      updateListing(id: $id, addImageUrls: $add, removeImageIds: $remove) {
        success
        message
        listing { id images { id imageUrl } }
      }
    }
  `,
  deleteImage: `
    mutation($imageId: ID!) {
      deleteListingImage(imageId: $imageId)
    }
  `,
};

function AuthContainer({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  return (
    <div className="auth-container">
      <div className="auth-tabs">
        <button className={isLogin ? 'active' : ''} onClick={() => setIsLogin(true)}>Login</button>
        <button className={!isLogin ? 'active' : ''} onClick={() => setIsLogin(false)}>Register</button>
      </div>
      {isLogin ? (
        <Login onLoginSuccess={onAuthSuccess} />
      ) : (
        <Register onRegisterSuccess={onAuthSuccess} />
      )}
    </div>
  );
}

function CreateListingForm({ onCreated, onCancel }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      let urls = [];
      if (files && files.length) {
        for (const f of files) {
          const url = await uploadImageToGCS(f);
          urls.push(url);
        }
      }
      const vars = { title, description: desc, price: String(price), imageUrls: urls };
      const data = await graphQLRequest(mutations.create, vars);
      if (!data.createListing.success) throw new Error(data.createListing.message || 'Create failed');
      onCreated(data.createListing.listing);
    } catch (e2) {
      setErr(e2.message || 'Error creating listing');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
      <h3>Create Listing</h3>
      {err && <p style={{ color: 'red' }}>{err}</p>}
      <div>
        <label>Title</label><br />
        <input value={title} onChange={e => setTitle(e.target.value)} required />
      </div>
      <div>
        <label>Description</label><br />
        <textarea value={desc} onChange={e => setDesc(e.target.value)} required />
      </div>
      <div>
        <label>Price</label><br />
        <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} required />
      </div>
      <div>
        <label>Images</label><br />
        <input type="file" multiple accept="image/*" onChange={e => setFiles([...e.target.files])} />
      </div>
      <div style={{ marginTop: 8 }}>
        <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create'}</button>
        <button type="button" onClick={onCancel} style={{ marginLeft: 8 }} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function ListingCard({ item, onRefresh }) {
  const [adding, setAdding] = useState(false);
  const [files, setFiles] = useState([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const markSold = async (sold) => {
    setWorking(true); setError('');
    try {
      await graphQLRequest(mutations.setSold, { id: item.id, sold });
      await onRefresh();
    } catch (e) {
      setError(e.message || 'Failed to update');
    } finally {
      setWorking(false);
    }
  };

  const addImages = async () => {
    if (!files || files.length === 0) return;
    setWorking(true); setError('');
    try {
      const urls = [];
      for (const f of files) {
        const url = await uploadImageToGCS(f);
        urls.push(url);
      }
      await graphQLRequest(mutations.updateAddRemove, { id: item.id, add: urls, remove: [] });
      setFiles([]);
      setAdding(false);
      await onRefresh();
    } catch (e) {
      setError(e.message || 'Failed to add images');
    } finally {
      setWorking(false);
    }
  };

  const removeImage = async (imageId) => {
    setWorking(true); setError('');
    try {
      await graphQLRequest(mutations.deleteImage, { imageId: String(imageId) });
      await onRefresh();
    } catch (e) {
      setError(e.message || 'Failed to remove image');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h4 style={{ margin: 0 }}>{item.title} {item.sold ? '— SOLD' : ''}</h4>
        <div>
          {!item.sold ? (
            <button onClick={() => markSold(true)} disabled={working}>Mark Sold</button>
          ) : (
            <button onClick={() => markSold(false)} disabled={working}>Restore</button>
          )}
        </div>
      </div>
      <p style={{ marginTop: 6 }}>{item.description}</p>
      <div>Price: ${Number(item.price).toFixed(2)}</div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {item.images && item.images.length > 0 ? item.images.map(img => (
          <div key={img.id} style={{ border: '1px solid #eee', padding: 6, borderRadius: 6 }}>
            <img src={img.imageUrl} alt="" style={{ width: 140, height: 140, objectFit: 'cover', display: 'block' }} />
            <button onClick={() => removeImage(img.id)} disabled={working} style={{ marginTop: 6 }}>Remove</button>
          </div>
        )) : <div>No images</div>}
      </div>
      {!adding ? (
        <button style={{ marginTop: 8 }} onClick={() => setAdding(true)} disabled={working}>Add Images</button>
      ) : (
        <div style={{ marginTop: 8, borderTop: '1px dashed #ccc', paddingTop: 8 }}>
          <input type="file" multiple accept="image/*" onChange={e => setFiles([...e.target.files])} />
          <div style={{ marginTop: 6 }}>
            <button onClick={addImages} disabled={working || !files.length}>{working ? 'Uploading…' : 'Upload'}</button>
            <button onClick={() => { setAdding(false); setFiles([]); }} style={{ marginLeft: 8 }} disabled={working}>Cancel</button>
          </div>
        </div>
      )}
      {error && <p style={{ color: 'red', marginTop: 8 }}>{error}</p>}
    </div>
  );
}

function MainApp({ user, onLogout }) {
  const [search, setSearch] = useState('');
  const [includeSold, setIncludeSold] = useState(false);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useMemo(() => async () => {
    setLoading(true); setError('');
    try {
      const data = await graphQLRequest(queries.list, { search: search || null, includeSold });
      setListings(data.listings || []);
    } catch (e) {
      setError(e.message || 'Failed to load listings');
    } finally {
      setLoading(false);
    }
  }, [search, includeSold]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="App" style={{ padding: 16 }}>
      <header className="App-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0 }}>BuffsMarket 2.0</h1>
          {user && <p style={{ margin: '4px 0 0' }}>Welcome, {user.firstName || user.username}!</p>}
        </div>
        <button onClick={onLogout}>Logout</button>
      </header>

      <section style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          placeholder="Search listings…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
          style={{ minWidth: 260 }}
        />
        <button onClick={load}>Search</button>
        <label style={{ marginLeft: 12 }}>
          <input type="checkbox" checked={includeSold} onChange={e => setIncludeSold(e.target.checked)} />
          {' '}Include sold
        </label>
        <button style={{ marginLeft: 'auto' }} onClick={() => setCreating(true)}>+ Create Listing</button>
      </section>

      {creating && (
        <div style={{ marginTop: 16 }}>
          <CreateListingForm
            onCreated={() => { setCreating(false); load(); }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      <section style={{ marginTop: 16 }}>
        {loading ? (
          <p>Loading…</p>
        ) : error ? (
          <p style={{ color: 'red' }}>{error}</p>
        ) : listings.length === 0 ? (
          <p>No listings found.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {listings.map(item => (
              <ListingCard key={item.id} item={item} onRefresh={load} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const userData = localStorage.getItem('user');
    if (token && userData) {
      try {
        setUser(JSON.parse(userData));
        setIsAuthenticated(true);
      } catch {
        setUser(null);
        setIsAuthenticated(false);
      }
    }
    const handleStorageChange = (e) => {
      if (e.key === 'authToken' || e.key === 'user') {
        const t = localStorage.getItem('authToken');
        const u = localStorage.getItem('user');
        if (t && u) {
          try {
            setUser(JSON.parse(u));
            setIsAuthenticated(true);
          } catch {
            setUser(null);
            setIsAuthenticated(false);
          }
        } else {
          setUser(null);
          setIsAuthenticated(false);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleAuthSuccess = (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    setUser(null);
    setIsAuthenticated(false);
    window.location.reload();
  };

  if (!isAuthenticated) {
    return <AuthContainer onAuthSuccess={handleAuthSuccess} />;
  }

  return <MainApp user={user} onLogout={handleLogout} />;
}

export default App;
