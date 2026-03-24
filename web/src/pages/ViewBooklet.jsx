import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileWarning } from 'lucide-react';
import { api } from '../services/api';
import './ViewBooklet.css';

export default function ViewBooklet() {
  const { bookletId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // 'loading' | 'available' | 'pdf' | 'unavailable'
  const [totalPages, setTotalPages] = useState(0);
  const [message, setMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfUrl, setPdfUrl] = useState('');

  useEffect(() => {
    if (!bookletId) {
      setStatus('unavailable');
      setMessage('No booklet ID');
      return;
    }
    api.files.bookletAvailability(bookletId)
      .then((data) => {
        if (data.available && data.totalPages > 0) {
          setStatus('available');
          setTotalPages(data.totalPages);
          setMessage(data.message || null);
          setPdfUrl('');
        } else if (data.available && data.hasPdf) {
          setStatus('pdf');
          setTotalPages(0);
          setMessage(data.message || 'PDF on server');
          setPdfUrl(api.files.bookletPdfUrl(bookletId));
        } else {
          setStatus('unavailable');
          setMessage(data.message || 'Answer sheet files not found on server.');
          setPdfUrl('');
        }
      })
      .catch(() => {
        setStatus('unavailable');
        setMessage('Could not check file availability.');
        setPdfUrl('');
      });
  }, [bookletId]);

  if (status === 'loading') {
    return (
      <div className="view-booklet">
        <div className="view-booklet-bar">
          <button type="button" className="btn-back" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} /> Back
          </button>
          <span className="view-booklet-title">Answer sheet — {bookletId}</span>
        </div>
        <div className="view-booklet-loading">Checking if file is available…</div>
      </div>
    );
  }

  if (status === 'unavailable') {
    return (
      <div className="view-booklet">
        <div className="view-booklet-bar">
          <button type="button" className="btn-back" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} /> Back
          </button>
          <span className="view-booklet-title">Answer sheet — {bookletId}</span>
        </div>
        <div className="view-booklet-unavailable">
          <FileWarning size={48} className="unavailable-icon" />
          <h2>File not available</h2>
          <p>{message}</p>
          <p className="view-booklet-hint">Ensure the booklet was scanned with PDF upload, and Admin → Scan output paths points to the folder where the API stores PDFs (e.g. /data/scan-output in Docker).</p>
        </div>
      </div>
    );
  }

  if (status === 'pdf' && pdfUrl) {
    return (
      <div className="view-booklet">
        <div className="view-booklet-bar">
          <button type="button" className="btn-back" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} /> Back
          </button>
          <span className="view-booklet-title">Answer sheet (PDF) — {bookletId}</span>
          {message && <span className="view-booklet-badge">{message}</span>}
        </div>
        <div className="view-booklet-pdf-wrap">
          <iframe title={`Booklet ${bookletId}`} src={pdfUrl} className="view-booklet-pdf-frame" />
        </div>
        <div className="view-booklet-pdf-footer">
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="view-booklet-pdf-open">Open PDF in new tab</a>
        </div>
      </div>
    );
  }

  return (
    <div className="view-booklet">
      <div className="view-booklet-bar">
        <button type="button" className="btn-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} /> Back
        </button>
        <span className="view-booklet-title">Answer sheet — {bookletId}</span>
        {message && <span className="view-booklet-badge">{message}</span>}
      </div>

      <div className="view-booklet-body">
        <div className="view-booklet-thumbs">
          <span className="thumbs-label">Pages</span>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              className={`thumb-item ${currentPage === p ? 'active' : ''}`}
              onClick={() => setCurrentPage(p)}
            >
              <div className="thumb-img">
                <img src={api.files.pageUrl(bookletId, p)} alt={`Page ${p}`} />
              </div>
              <span className="thumb-num">{p}</span>
            </button>
          ))}
        </div>
        <div className="view-booklet-main">
          <img
            src={api.files.pageUrl(bookletId, currentPage)}
            alt={`Page ${currentPage}`}
            className="view-booklet-img"
          />
          <div className="view-booklet-pager">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((c) => Math.max(1, c - 1))}
            >
              Previous
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((c) => Math.min(totalPages, c + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
