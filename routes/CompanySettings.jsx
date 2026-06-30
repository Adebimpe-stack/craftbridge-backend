import React, { useState, useEffect } from "react";
import { api } from "../utils/api"; // Assuming you have a configured api utility

export default function CompanySettings() {
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeChangeReason, setTypeChangeReason] = useState("");

  const user = JSON.parse(localStorage.getItem("user"));

  useEffect(() => {
    const fetchCompany = async () => {
      if (!user?.companyId) {
        setError("You are not associated with a company.");
        setLoading(false);
        return;
      }
      try {
        const { data } = await api.get(`/employer/${user.companyId}`);
        setCompany(data);
      } catch (err) {
        setError("Failed to fetch company details.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchCompany();
  }, [user?.companyId]);

  const handleDeactivate = async () => {
    if (window.confirm("Are you sure you want to deactivate your company? All active jobs will be closed.")) {
      try {
        const { data } = await api.put(`/employer/${company._id}/deactivate`);
        setCompany(data.company);
        alert("Company deactivated successfully.");
      } catch (err) {
        alert("Failed to deactivate company.");
      }
    }
  };

  const handleReactivate = async () => {
    try {
      const { data } = await api.put(`/employer/${company._id}/reactivate`);
      setCompany(data.company);
      alert("Company reactivated successfully.");
    } catch (err) {
      alert("Failed to reactivate company.");
    }
  };

  const handleRequestTypeChange = async (e) => {
    e.preventDefault();
    if (!typeChangeReason) {
      alert("Please provide a reason for the type change.");
      return;
    }
    const requestedType = company.companyType === 'employer' ? 'agency' : 'employer';
    try {
      const { data } = await api.post(`/employer/${company._id}/request-type-change`, {
        requestedType,
        reason: typeChangeReason,
      });
      setCompany(prev => ({ ...prev, typeChangeRequest: data.typeChangeRequest }));
      alert("Type change request submitted.");
    } catch (err) {
      alert(err.response?.data?.message || "Failed to submit request.");
    }
  };

  const handleRequestDeletion = async () => {
    if (window.confirm("Are you sure you want to request deletion? This action is irreversible after admin approval.")) {
      try {
        await api.post(`/employer/${company._id}/request-deletion`);
        alert("Deletion request submitted. Your company is now inactive.");
        // Refetch or update state
        const { data } = await api.get(`/employer/${user.companyId}`);
        setCompany(data);
      } catch (err) {
        alert("Failed to request deletion.");
      }
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  if (!company) return <div>No company data found.</div>;

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Company Settings</h1>
      <p>Manage your company status and details.</p>

      <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <h2>Company Status</h2>
        <p>Current Status: <strong>{company.isActive ? 'Active' : 'Inactive'}</strong></p>
        {company.isActive ? (
          <button onClick={handleDeactivate} style={{ background: 'orange', color: 'white', border: 'none', padding: '10px' }}>Deactivate Company</button>
        ) : (
          <button onClick={handleReactivate} style={{ background: 'green', color: 'white', border: 'none', padding: '10px' }}>Reactivate Company</button>
        )}
      </div>

      <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <h2>Change Account Type</h2>
        <p>Current Type: <strong>{company.companyType}</strong></p>
        {company.typeChangeRequest?.status === 'pending' ? (
          <p><em>Your request to change type is pending admin review.</em></p>
        ) : (
          <form onSubmit={handleRequestTypeChange}>
            <p>Request to change type to <strong>{company.companyType === 'employer' ? 'agency' : 'employer'}</strong>.</p>
            <textarea
              value={typeChangeReason}
              onChange={(e) => setTypeChangeReason(e.target.value)}
              placeholder="Reason for changing account type"
              required
              style={{ width: '100%', minHeight: '80px', marginBottom: '10px' }}
            />
            <button type="submit">Submit Request</button>
          </form>
        )}
      </div>

      <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', background: '#fff0f0' }}>
        <h2>Danger Zone</h2>
        {company.deletionRequest?.status === 'pending' ? (
          <p><em>Your company is scheduled for deletion. An admin will review this request.</em></p>
        ) : (
          <>
            <p>Request to permanently delete your company account. This action cannot be undone.</p>
            <button onClick={handleRequestDeletion} style={{ background: 'red', color: 'white', border: 'none', padding: '10px' }}>Request Company Deletion</button>
          </>
        )}
      </div>
    </div>
  );
}