import React, { useEffect, useRef, useState } from 'react';
import { Plus, ChevronDown, ChevronUp } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Card from '../components/Card';
import PageHeader from '../components/PageHeader';

const News = () => {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [newsItems, setNewsItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ title: '', body: '' });
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const didInitRef = useRef(false);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    fetchNews();
  }, []);

  const fetchNews = async () => {
    try {
      const res = await axios.get('/api/news');
      setNewsItems(res.data || []);
    } catch (error) {
      console.error('Error fetching news:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item) => {
    if (!isAdmin) return;
    setEditingAnnouncement(item);
    setFormData({ title: item.title || '', body: item.body || '' });
    setShowForm(true);
  };

  const startNewAnnouncement = () => {
    setEditingAnnouncement(null);
    setFormData({ title: '', body: '' });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!isAdmin) return;
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await axios.delete(`/api/news/${id}`);
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await fetchNews();
      toast.success('Announcement deleted');
    } catch (error) {
      console.error('Error deleting news:', error);
      toast.error(error?.response?.data?.error || error.message);
    }
  };

  const handlePin = async (id, pinned) => {
    if (!isAdmin) return;
    try {
      if (pinned) {
        await axios.post(`/api/news/${id}/unpin`);
        toast.success('Announcement unpinned');
      } else {
        await axios.post(`/api/news/${id}/pin`);
        toast.success('Announcement pinned');
      }
      await fetchNews();
    } catch (error) {
      console.error('Error updating pin status:', error);
      toast.error(error?.response?.data?.error || error.message);
    }
  };

  const resetForm = () => {
    setFormData({ title: '', body: '' });
    setEditingAnnouncement(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;

    try {
      if (editingAnnouncement) {
        await axios.put(`/api/news/${editingAnnouncement.id}`, formData);
      } else {
        await axios.post('/api/news', formData);
      }
      await fetchNews();
      resetForm();
      toast.success(editingAnnouncement ? 'Announcement updated' : 'Announcement posted');
    } catch (error) {
      console.error('Error creating news:', error);
      toast.error(error?.response?.data?.error || error.message);
    }
  };

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatDateTime = (value) => {
    if (!value) return 'Unknown time';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString();
  };

  if (loading) {
    return <div className="text-center py-8">Loading announcements...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        subtitle="Latest league updates"
        right={
          isAdmin ? (
            <button
              type="button"
              onClick={startNewAnnouncement}
              className="btn btn-primary flex items-center space-x-2"
            >
              <Plus size={20} />
              <span>Add Announcement</span>
            </button>
          ) : null
        }
      />

      {showForm && (
        <Card>
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            {editingAnnouncement ? 'Edit Announcement' : 'Create Announcement'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="input"
                  disabled={!isAdmin}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Story *</label>
                <textarea
                  required
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  className="input min-h-[160px]"
                  disabled={!isAdmin}
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <button type="submit" className="btn btn-primary" disabled={!isAdmin}>
                {editingAnnouncement ? 'Update' : 'Publish'}
              </button>
              <button type="button" onClick={resetForm} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-3">
        {newsItems.map((item) => {
          const expanded = expandedIds.has(item.id);
          return (
            <Card
              key={item.id}
              className="cursor-pointer transition hover:shadow-sm"
              onClick={() => toggleExpanded(item.id)}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 flex flex-wrap items-center gap-2">
                    <span>{item.title}</span>
                    {item.pinned ? (
                      <span className="text-[10px] uppercase tracking-wide text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
                        Pinned
                      </span>
                    ) : null}
                  </h3>
                  <div className="text-xs text-gray-500 mt-1">Posted {formatDateTime(item.created_at)}</div>
                </div>
                <div className="flex flex-col items-end gap-2 mt-1 text-gray-400 sm:flex-row sm:items-center">
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(item);
                        }}
                        className="btn btn-secondary"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePin(item.id, !!item.pinned);
                        }}
                        className="btn btn-secondary"
                      >
                        {item.pinned ? 'Unpin' : 'Pin'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.id);
                        }}
                        className="btn btn-danger"
                      >
                        Delete
                      </button>
                    </>
                  )}
                  {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </div>
              {expanded && (
                <div className="text-sm text-gray-700 mt-3 whitespace-pre-line">
                  {item.body}
                </div>
              )}
            </Card>
          );
        })}
        {newsItems.length === 0 && (
          <div className="text-center py-6 text-gray-500">No announcements posted yet.</div>
        )}
      </div>
    </div>
  );
};

export default News;
