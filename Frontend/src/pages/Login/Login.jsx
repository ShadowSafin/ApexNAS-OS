import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../../services/auth.service';
import './Login.css';

export default function Login() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('nasos_admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await authService.login(username, password);
      if (result.success) {
        navigate('/');
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      setError(err.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-mesh"></div>
      <div className="login-box">
        <div className="login-header">
          <div className="login-logo">⬡</div>
          <div className="login-branding">
            <h1 className="login-title">ApexNAS</h1>
            <p className="login-subtitle">Storage Management System</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading} className="login-button">
            <span className="login-button-text">
              {loading ? 'Signing in...' : 'Sign In'}
            </span>
            {!loading && <span className="login-button-icon">→</span>}
          </button>
        </form>

        <div className="login-footer">
          <p className="login-hint">Demo: admin / nasos_admin</p>
        </div>
      </div>
    </div>
  );
}
