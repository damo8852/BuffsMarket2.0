import React, { useEffect, useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import './styles/Home.css';
import Login from './components/Login';
import Register from './components/Register';

const GET_USERS = gql`
  query GetUsers {
    users {
      id
      username
      email
    }
  }
`;

const GET_ME = gql`
  query GetMe {
    me {
      id
      username
      email
      firstName
      lastName
    }
  }
`;

function GraphQLSandbox() {
  useEffect(() => {
    // Load the Apollo Sandbox script
    const script = document.createElement('script');
    script.src = 'https://embeddable-sandbox.cdn.apollographql.com/_latest/embeddable-sandbox.umd.production.min.js';
    script.async = true;
    script.onload = () => {
      // Initialize the sandbox once the script is loaded
      if (window.EmbeddedSandbox) {
        new window.EmbeddedSandbox({
          target: '#sandbox',
          initialEndpoint: 'http://localhost:8000/graphql/',
          includeCookies: false,
        });
      }
    };
    document.head.appendChild(script);

    // Cleanup function
    return () => {
      const existingScript = document.querySelector('script[src*="embeddable-sandbox"]');
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
      <div id="sandbox" style={{ width: '100%', height: '100%' }}></div>
    </div>
  );
}

function AuthContainer({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);

  const handleAuthSuccess = (user) => {
    onAuthSuccess(user);
  };

  return (
    <div className="auth-container">
      <div className="auth-tabs">
        <button 
          className={isLogin ? 'active' : ''} 
          onClick={() => setIsLogin(true)}
        >
          Login
        </button>
        <button 
          className={!isLogin ? 'active' : ''} 
          onClick={() => setIsLogin(false)}
        >
          Register
        </button>
      </div>
      
      {isLogin ? (
        <Login onLoginSuccess={handleAuthSuccess} />
      ) : (
        <Register onRegisterSuccess={handleAuthSuccess} />
      )}
    </div>
  );
}

function MainApp({ user, onLogout }) {
  const { loading, error, data } = useQuery(GET_USERS);

  return (
    
    <div className="App">
      
      <header className="App-header">
        <div className="user-info">
          <h1>BuffsMarket 2.0</h1>
          {user && (
            <div className="user-details">
              <p>Welcome, {user.firstName || user.username}!</p>
              <button onClick={onLogout} className="logout-btn" >Logout</button>
            </div>
          )}
        </div>
        
        <div className="graphql-test">
          <h2>GraphQL Test</h2>
          {loading && <p>Loading users...</p>}
          {error && <p>Error: {error.message}</p>}
          {data && (
            <div>
              <h3>Users from Django GraphQL:</h3>
              <ul>
                {data.users.map(user => (
                  <li key={user.id}>
                    {user.username} ({user.email})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        
        <div style={{ marginTop: '20px' }}>
          <a href="/graphql" style={{ color: '#61dafb', textDecoration: 'none' }}>
            Open GraphQL Sandbox
          </a>
        </div>
      </header>
    </div>
  );
}

function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('authToken');
    const userData = localStorage.getItem('user');
    
    if (token && userData) {
      setUser(JSON.parse(userData));
      setIsAuthenticated(true);
    }
    const handleStorageChange = (e) => {
      if (e.key === 'authToken' || e.key === 'user') {
        if (e.key === 'authToken' && e.newValue) {
          try {
            const userData = localStorage.getItem('user');
            if (userData) {
              setUser(JSON.parse(userData));
              setIsAuthenticated(true);
            }
          } catch (error) {
            console.error('Error parsing user data:', error);
          }
        } else if (e.key === 'authToken' && !e.newValue) {
          setUser(null);
          setIsAuthenticated(false);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    // Listen for popstate events (back/forward buttons)
    window.addEventListener('popstate', handleLocationChange);
    
    // Custom navigation handler
    window.navigateTo = (path) => {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
    };

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
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

  // Check if we're on the graphql route
  if (currentPath === '/graphql') {
    return <GraphQLSandbox />;
  }

  // Show authentication if not logged in
  if (!isAuthenticated) {
    return <AuthContainer onAuthSuccess={handleAuthSuccess} />;
  }

  return <MainApp user={user} onLogout={handleLogout} />;
}

export default App;
