/**
 * Settings page - Platform configuration
 */

import { Card } from '../components/Card';

export function Settings() {
  return (
    <div className="settings-page">
      <h2>Settings</h2>
      
      <div className="settings-grid">
        <Card title="API Configuration">
          <div className="settings-form">
            <div className="form-group">
              <label>API Endpoint</label>
              <input type="text" defaultValue="http://localhost:3001" />
            </div>
            <div className="form-group">
              <label>WebSocket Endpoint</label>
              <input type="text" defaultValue="ws://localhost:3001/ws" />
            </div>
          </div>
        </Card>
        
        <Card title="Trading Settings">
          <div className="settings-form">
            <div className="form-group">
              <label>Min Profit USD</label>
              <input type="number" defaultValue="10" />
            </div>
            <div className="form-group">
              <label>Max Gas Price (Gwei)</label>
              <input type="number" defaultValue="100" />
            </div>
            <div className="form-group">
              <label>Max Trade Size USD</label>
              <input type="number" defaultValue="10000" />
            </div>
          </div>
        </Card>
        
        <Card title="Notification Settings">
          <div className="settings-form">
            <div className="form-group">
              <label>
                <input type="checkbox" defaultChecked /> Enable WebSocket notifications
              </label>
            </div>
            <div className="form-group">
              <label>
                <input type="checkbox" /> Enable email alerts
              </label>
            </div>
          </div>
        </Card>
        
        <Card title="About">
          <div className="about-info">
            <p><strong>Arbitrage Platform</strong></p>
            <p>Version: 1.0.0</p>
            <p>A multi-chain arbitrage trading platform with real-time monitoring.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default Settings;
