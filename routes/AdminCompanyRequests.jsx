import React, { useState, useEffect } from "react";
import { api } from "../utils/api";

export default function AdminCompanyRequests() {
  const [typeRequests, setTypeRequests] = useState([]);
  const [deletionRequests, setDeletionRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [typeRes, deletionRes] = await Promise.all([
        api.get("/admin/type-change-requests"),
        api.get("/admin/deletion-requests"),
      ]);
      setTypeRequests(typeRes.data);
      setDeletionRequests(deletionRes.data);
    } catch (error) {
      console.error("Failed to fetch requests", error);
      alert("Failed to fetch requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleApprove = async (type, id) => {
    const endpoint = type === 'type' ? `/admin/type-change-requests/${id}/approve` : `/admin/deletion-requests/${id}/approve`;
    if (window.confirm(`Are you sure you want to APPROVE this ${type} request?`)) {
      try {
        await api.put(endpoint);
        alert("Request approved.");
        fetchData();
      } catch (err) {
        alert("Failed to approve request.");
      }
    }
  };

  const handleReject = async (type, id) => {
    const reason = prompt("Please provide a reason for rejection:");
    if (reason) {
      const endpoint = type === 'type' ? `/admin/type-change-requests/${id}/reject` : `/admin/deletion-requests/${id}/reject`;
      try {
        await api.put(endpoint, { reason });
        alert("Request rejected.");
        fetchData();
      } catch (err) {
        alert("Failed to reject request.");
      }
    }
  };

  if (loading) return <div>Loading requests...</div>;

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Admin - Company Management Requests</h1>

      <h2>Account Type Change Requests ({typeRequests.length})</h2>
      {typeRequests.length > 0 ? (
        <table border="1" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Company</th>
              <th>Current Type</th>
              <th>Requested Type</th>
              <th>Reason</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {typeRequests.map(req => (
              <tr key={req.companyId}>
                <td>{req.companyName}</td>
                <td>{req.currentType}</td>
                <td>{req.requestedType}</td>
                <td>{req.reason}</td>
                <td>
                  <button onClick={() => handleApprove('type', req.companyId)}>Approve</button>
                  <button onClick={() => handleReject('type', req.companyId)}>Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p>No pending type change requests.</p>}

      <h2 style={{ marginTop: '40px' }}>Account Deletion Requests ({deletionRequests.length})</h2>
      {deletionRequests.length > 0 ? (
        <table border="1" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Company</th>
              <th>Owner</th>
              <th>Requested At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {deletionRequests.map(req => (
              <tr key={req.companyId}>
                <td>{req.companyName}</td>
                <td>{req.owner?.name} ({req.owner?.email})</td>
                <td>{new Date(req.requestedAt).toLocaleString()}</td>
                <td>
                  <button onClick={() => handleApprove('deletion', req.companyId)}>Approve Deletion</button>
                  <button onClick={() => handleReject('deletion', req.companyId)}>Reject Deletion</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p>No pending deletion requests.</p>}
    </div>
  );
}