import React, { useState, useEffect } from 'react';
import axios from 'axios';

const cardStyle = {
  padding: '20px',
  margin: '20px 0',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
};

const TalentMarketplace = () => {
  const [talent, setTalent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTalent = async () => {
      try {
        const response = await axios.get('/api/users/talent');
        setTalent(response.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to load talent marketplace. Please try again later.');
        setLoading(false);
      }
    };

    fetchTalent();
  }, []);

  if (loading) {
    return <div>Loading professionals...</div>;
  }

  if (error) {
    return <div style={{ color: 'red' }}>{error}</div>;
  }

  return (
    <div>
      <h2>Skilled Professionals Marketplace</h2>
      <p>Discover and connect with top talent in the construction industry.</p>

      {talent.length === 0 ? (
        <p>No professionals found at the moment.</p>
      ) : (
        <div>
          {talent.map(user => (
            <div key={user._id} style={cardStyle}>
              <h3>{user.name}</h3>
              {user.headline && <p style={{ fontStyle: 'italic', color: '#475569' }}>{user.headline}</p>}
              {user.primaryTrade && <p><b>Primary Trade:</b> {user.primaryTrade}</p>}
              {user.experienceYears && <p><b>Years of Experience:</b> {user.experienceYears}</p>}
              {user.location && <p><b>Location:</b> {user.location}</p>}
              {user.skills && user.skills.length > 0 && (
                <p><b>Skills:</b> {user.skills.join(', ')}</p>
              )}
              {user.bio && <p>{user.bio}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TalentMarketplace;