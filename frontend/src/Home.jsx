import React, { useEffect, useState } from 'react';
import './styles/Home.css';
import Login from './components/Login';
import Register from './components/Register';

function AuthContainer({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);

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
        <Login onLoginSuccess={onAuthSuccess} />
      ) : (
        <Register onRegisterSuccess={onAuthSuccess} />
      )}
    </div>
  );
}

function MainApp({ user, onLogout }) {
  return (
    <div className="App">
      <header className="App-header">
        <div className="user-info">
          <h1>BuffsMarket 2.0</h1>
          {user && (
            <div className="user-details">
              <p>Welcome, {user.firstName || user.username}!</p>
              <button onClick={onLogout} className="logout-btn">Logout</button>
            </div>
          )}
        </div>
      </header>
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

    return () => {
      window.removeEventListener('storage', handleStorageChange);
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

  if (!isAuthenticated) {
    return <AuthContainer onAuthSuccess={handleAuthSuccess} />;
  }

  return <MainApp user={user} onLogout={handleLogout} />;
}

export default App;
