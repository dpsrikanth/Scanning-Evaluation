import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardCheck, LogOut, RefreshCw, ExternalLink } from 'lucide-react';
import { api } from '../services/api';
import './ScanQcPortal.css';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function dateOnly(v) {
  if (v == null) return '';
  const s = String(v);
  return s.includes('T') ? s.slice(0, 10) : s.slice(0, 10);
}

export default function ScanQcPortal() {
  const navigate = useNavigate();
  const user = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      if (u.roloName && !u.roleName) u.roleName = u.roloName;
      return u;
    } catch {
      return {};
    }
  }, []);

  const showVendor =
    user.roleName === 'VendorQC' || (user.roleName === 'Admin' && user.source === 'scan');
  const showCustomer =
    user.roleName === 'CustomerQC' || (user.roleName === 'Admin' && user.source === 'scan');
  const showRejected =
    user.roleName === 'Operator' || (user.roleName === 'Admin' && user.source === 'scan');

  const [tab, setTab] = useState(() => {
    if (showVendor) return 'vendor';
    if (showCustomer) return 'customer';
    return 'rejected';
  });

  const [date, setDate] = useState(todayStr);
  const [paperId, setPaperId] = useState('');
  const [papers, setPapers] = useState([]);
  const [lots, setLots] = useState([]);
  const [booklets, setBooklets] = useState([]);
  const [selectedLot, setSelectedLot] = useState(null);
  const [rejected, setRejected] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const locationId = user.locationId;

  useEffect(() => {
    if (user.source !== 'scan') {
      navigate('/login', { replace: true });
    }
  }, [user.source, navigate]);

  useEffect(() => {
    if (user.source !== 'scan') return;
    (async () => {
      try {
        const settings = await api.scan.settings();
        setPapers((settings && settings.papers) ? settings.papers : []);
      } catch {
        setPapers([]);
      }
    })();
  }, [user.source]);

  const loadLots = useCallback(async () => {
    if (tab !== 'vendor' && tab !== 'customer') return;
    setErr('');
    try {
      const params = { date, locationId };
      if (paperId) params.paperId = paperId;
      const data =
        tab === 'vendor'
          ? await api.scanQc.vendorLots(params)
          : await api.scanQc.customerLots(params);
      setLots(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message);
    }
  }, [tab, date, paperId, locationId]);

  useEffect(() => {
    loadLots();
  }, [loadLots]);

  const openLot = async (row) => {
    setSelectedLot(row);
    setBooklets([]);
    setErr('');
    try {
      const q = {
        paperId: row.PaperID,
        lotDate: dateOnly(row.lotDate),
        locationId,
      };
      const data =
        tab === 'vendor'
          ? await api.scanQc.vendorLotBooklets(q)
          : await api.scanQc.customerLotBooklets(q);
      setBooklets(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message);
    }
  };

  const loadRejected = useCallback(async () => {
    setErr('');
    try {
      const data = await api.scanQc.rejectedBooklets();
      setRejected(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    if (tab === 'rejected') loadRejected();
  }, [tab, loadRejected]);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const approveVendorLotRow = async (row) => {
    const pending = Number(row.pendingVendor) || 0;
    const rej = Number(row.rejectedVendor) || 0;
    if (
      pending + rej > 0 &&
      !window.confirm(
        `Approve vendor lot with ${pending} still pending and ${rej} rejected at vendor stage? You can still proceed.`
      )
    ) {
      return;
    }
    setErr('');
    try {
      await api.scanQc.approveVendorLot({
        paperId: row.PaperID,
        lotDate: dateOnly(row.lotDate),
        locationId,
      });
      setMsg('Vendor lot approved.');
      loadLots();
      setSelectedLot(null);
      setBooklets([]);
    } catch (e) {
      setErr(e.message);
    }
  };

  const approveCustomerLotRow = async (row) => {
    const pending = Number(row.pendingCustomer) || 0;
    const rej = Number(row.rejectedCustomer) || 0;
    if (
      pending + rej > 0 &&
      !window.confirm(
        `Approve customer lot with ${pending} still pending and ${rej} rejected at customer stage? You can still proceed.`
      )
    ) {
      return;
    }
    setErr('');
    try {
      await api.scanQc.approveCustomerLot({
        paperId: row.PaperID,
        lotDate: dateOnly(row.lotDate),
        locationId,
      });
      setMsg('Customer lot approved.');
      loadLots();
      setSelectedLot(null);
      setBooklets([]);
    } catch (e) {
      setErr(e.message);
    }
  };

  const vendorAct = async (bookletId, status) => {
    const reason =
      status === 'Rejected' ? window.prompt('Reason for rejection (optional):') || '' : '';
    setErr('');
    try {
      await api.scanQc.vendorDecision(bookletId, { status, reason: reason || undefined });
      setMsg(`Booklet ${status.toLowerCase()} (vendor).`);
      if (selectedLot) openLot(selectedLot);
      loadLots();
    } catch (e) {
      setErr(e.message);
    }
  };

  const customerAct = async (bookletId, status) => {
    const reason =
      status === 'Rejected' ? window.prompt('Reason for rejection (optional):') || '' : '';
    setErr('');
    try {
      await api.scanQc.customerDecision(bookletId, { status, reason: reason || undefined });
      setMsg(`Booklet ${status.toLowerCase()} (customer).`);
      if (selectedLot) openLot(selectedLot);
      loadLots();
    } catch (e) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(''), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  if (user.source !== 'scan') {
    return null;
  }

  return (
    <div className="sqc-page">
      <header className="sqc-header">
        <div className="sqc-brand">
          <ClipboardCheck size={22} />
          <span>Scan QC</span>
          <span className="sqc-user">{user.fullName || user.username}</span>
        </div>
        <button type="button" className="sqc-logout" onClick={logout}>
          <LogOut size={16} /> Sign out
        </button>
      </header>

      <div className="sqc-body">
        <div className="sqc-tabs">
          {showVendor && (
            <button
              type="button"
              className={tab === 'vendor' ? 'active' : ''}
              onClick={() => { setTab('vendor'); setSelectedLot(null); setBooklets([]); }}
            >
              Vendor QC
            </button>
          )}
          {showCustomer && (
            <button
              type="button"
              className={tab === 'customer' ? 'active' : ''}
              onClick={() => { setTab('customer'); setSelectedLot(null); setBooklets([]); }}
            >
              Customer QC
            </button>
          )}
          {showRejected && (
            <button
              type="button"
              className={tab === 'rejected' ? 'active' : ''}
              onClick={() => { setTab('rejected'); setSelectedLot(null); setBooklets([]); }}
            >
              Rejected (operators)
            </button>
          )}
        </div>

        {msg && <div className="sqc-flash ok">{msg}</div>}
        {err && <div className="sqc-flash err">{err}</div>}

        {(tab === 'vendor' || tab === 'customer') && (
          <>
            <div className="sqc-filters">
              <label>
                Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label>
                Paper
                <select value={paperId} onChange={(e) => setPaperId(e.target.value)}>
                  <option value="">All papers</option>
                  {papers.map((p) => (
                    <option key={p.PaperID} value={p.PaperID}>
                      {p.PaperCode} — {p.PaperName}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="sqc-btn" onClick={() => loadLots()}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

            <div className="sqc-grid">
              <div className="sqc-panel">
                <h3>Daily lots</h3>
                <table className="sqc-table">
                  <thead>
                    <tr>
                      <th>Paper</th>
                      <th>Date</th>
                      <th>Total</th>
                      <th>Pending</th>
                      <th>Appr.</th>
                      <th>Rej.</th>
                      <th>Lot OK</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lots.map((row) => (
                      <tr
                        key={`${row.PaperID}-${dateOnly(row.lotDate)}`}
                        className={
                          selectedLot &&
                          selectedLot.PaperID === row.PaperID &&
                          dateOnly(selectedLot.lotDate) === dateOnly(row.lotDate)
                            ? 'selected'
                            : ''
                        }
                      >
                        <td>{row.PaperCode}</td>
                        <td>{dateOnly(row.lotDate)}</td>
                        <td>{row.totalBooklets}</td>
                        <td>{tab === 'vendor' ? row.pendingVendor : row.pendingCustomer}</td>
                        <td>{tab === 'vendor' ? row.approvedVendor : row.approvedCustomer}</td>
                        <td>{tab === 'vendor' ? row.rejectedVendor : row.rejectedCustomer}</td>
                        <td>
                          {tab === 'vendor'
                            ? row.vendorLotApprovedAt
                              ? 'Yes'
                              : '—'
                            : row.customerLotApprovedAt
                              ? 'Yes'
                              : '—'}
                        </td>
                        <td>
                          <button type="button" className="sqc-btn sm" onClick={() => openLot(row)}>
                            Open
                          </button>
                          {tab === 'vendor' && (
                            <button
                              type="button"
                              className="sqc-btn sm primary"
                              onClick={() => approveVendorLotRow(row)}
                            >
                              Approve lot
                            </button>
                          )}
                          {tab === 'customer' && (
                            <button
                              type="button"
                              className="sqc-btn sm primary"
                              onClick={() => approveCustomerLotRow(row)}
                            >
                              Approve lot
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!lots.length && <p className="sqc-empty">No lots for this filter.</p>}
              </div>

              <div className="sqc-panel">
                <h3>Booklets in lot</h3>
                {!selectedLot && <p className="sqc-hint">Select a lot and click Open.</p>}
                {selectedLot && (
                  <table className="sqc-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Pages</th>
                        <th>Status</th>
                        <th>View</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {booklets.map((b) => (
                        <tr key={b.BookletID}>
                          <td className="mono">{b.BookletID}</td>
                          <td>{b.TotalPagesScanned}</td>
                          <td>
                            {tab === 'vendor' ? b.VendorQcStatus : b.CustomerQcStatus}
                          </td>
                          <td>
                            <Link
                              to={`/view-booklet/${encodeURIComponent(b.BookletID)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="sqc-link"
                            >
                              <ExternalLink size={12} /> Open
                            </Link>
                          </td>
                          <td>
                            {tab === 'vendor' && (
                              <>
                                <button
                                  type="button"
                                  className="sqc-btn sm ok"
                                  onClick={() => vendorAct(b.BookletID, 'Approved')}
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  className="sqc-btn sm danger"
                                  onClick={() => vendorAct(b.BookletID, 'Rejected')}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {tab === 'customer' && (
                              <>
                                <button
                                  type="button"
                                  className="sqc-btn sm ok"
                                  onClick={() => customerAct(b.BookletID, 'Approved')}
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  className="sqc-btn sm danger"
                                  onClick={() => customerAct(b.BookletID, 'Rejected')}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {selectedLot && !booklets.length && (
                  <p className="sqc-empty">No booklets in this lot.</p>
                )}
              </div>
            </div>
          </>
        )}

        {tab === 'rejected' && (
          <div className="sqc-panel full">
            <div className="sqc-row">
              <h3>Rejected booklets (rescan same ID in scanner-desktop)</h3>
              <button type="button" className="sqc-btn" onClick={() => loadRejected()}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
            <table className="sqc-table">
              <thead>
                <tr>
                  <th>Booklet</th>
                  <th>Paper</th>
                  <th>Date</th>
                  <th>Vendor</th>
                  <th>Customer</th>
                  <th>Reasons</th>
                </tr>
              </thead>
              <tbody>
                {rejected.map((r) => (
                  <tr key={r.BookletID}>
                    <td className="mono">{r.BookletID}</td>
                    <td>{r.PaperCode}</td>
                    <td>{dateOnly(r.ScanDate)}</td>
                    <td>{r.VendorQcStatus}</td>
                    <td>{r.CustomerQcStatus}</td>
                    <td>
                      {[r.VendorQcReason, r.CustomerQcReason].filter(Boolean).join(' / ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rejected.length && <p className="sqc-empty">No rejected booklets.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
