import React, { useEffect, useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import './App.css';

const GET_USERS = gql`
  query GetUsers {
    users {
      id
      username
      email
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

function MainApp() {
  const { loading, error, data } = useQuery(GET_USERS);

  return (
    <div className="App">
      <header className="App-header">
        <h1>BuffsMarket 2.0</h1>
        <p>Welcome to your marketplace!</p>
        
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

  useEffect(() => {
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

  // Check if we're on the graphql route
  if (currentPath === '/graphql') {
    return <GraphQLSandbox />;
  }

  return <MainApp />;
}

export default App;
