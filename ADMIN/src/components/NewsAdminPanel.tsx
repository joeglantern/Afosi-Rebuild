import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { 
  Plus, Trash2, Edit2, Save, X, Eye, EyeOff, Star, StarOff,
  Calendar, Upload, AlertCircle, Newspaper, FileText, Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { newsAPI, uploadAPI } from "@/services/api";

interface Newsletter {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  image_url?: string;
  pdf_url?: string;
  category: string;
  location?: string;
  published_date: string;
  is_published: boolean;
  featured: boolean;
  author?: string;
  tags?: string[];
  type: string;
  views: number;
  created_at: string;
}

const categories = [
  { value: 'newsletter', label: 'Newsletter', color: 'bg-orange-100 text-orange-700' },
  { value: 'report', label: 'Annual Report', color: 'bg-indigo-100 text-indigo-700' },
];

const NewsAdminPanel = () => {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Newsletter>>({
    category: 'newsletter',
    type: 'newsletter',
    is_published: true,
    featured: false
  });
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchNewsletters();
    fetchStats();
  }, []);

  const fetchNewsletters = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await newsAPI.getAll();
      setNewsletters(response.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load newsletters');
      console.error('Error fetching newsletters:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await newsAPI.getStats();
      setStats(response.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  };

  const handleTitleChange = (title: string) => {
    setFormData({
      ...formData,
      title,
      slug: generateSlug(title)
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('Image size must be less than 20MB');
      return;
    }

    try {
      setUploading(true);
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);

      const response = await uploadAPI.uploadFile(uploadFormData, 'news');
      const url = response?.data?.url;

      if (url) {
        setFormData({ ...formData, image_url: url });
      } else {
        throw new Error('Upload failed - no URL returned');
      }
    } catch (err: any) {
      console.error('Error uploading image:', err);
      alert('Failed to upload image: ' + (err.message || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file');
      return;
    }

    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('PDF size must be less than 100MB');
      return;
    }

    try {
      setUploadingPdf(true);
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);

      const response = await uploadAPI.uploadFile(uploadFormData, 'news');
      const url = response?.data?.url;

      if (url) {
        setFormData({ ...formData, pdf_url: url });
      } else {
        throw new Error('Upload failed - no URL returned');
      }
    } catch (err: any) {
      console.error('Error uploading PDF:', err);
      alert('Failed to upload PDF: ' + (err.message || 'Unknown error'));
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title || !formData.excerpt || !formData.published_date) {
      alert('Please fill in all required fields (Title, Excerpt, Published Date)');
      return;
    }

    if (!formData.pdf_url) {
      alert('Please upload a PDF file');
      return;
    }

    try {
      const dataToSave = {
        title: formData.title,
        slug: formData.slug || formData.title.toLowerCase().replace(/\s+/g, '-'),
        excerpt: formData.excerpt,
        content: formData.content || formData.excerpt,
        published_date: formData.published_date,
        pdf_url: formData.pdf_url,
        image_url: formData.image_url,
        category: formData.category || 'newsletter',
        location: formData.location,
        is_published: formData.is_published !== undefined ? formData.is_published : true,
        featured: formData.featured || false,
        author: formData.author || 'AFOSI Team',
        tags: formData.tags || []
      };

      if (editingId) {
        await newsAPI.update(editingId, dataToSave);
      } else {
        await newsAPI.create(dataToSave);
      }

      await fetchNewsletters();
      await fetchStats();
      handleCancel();
    } catch (err: any) {
      console.error('Error saving newsletter:', err);
      alert('Failed to save newsletter: ' + (err.message || 'Unknown error'));
    }
  };

  const handleEdit = (newsletter: Newsletter) => {
    setFormData(newsletter);
    setEditingId(newsletter.id);
    setIsAddingNew(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this newsletter?')) return;

    try {
      await newsAPI.delete(id);
      await fetchNewsletters();
      await fetchStats();
    } catch (err: any) {
      console.error('Error deleting newsletter:', err);
      alert('Failed to delete newsletter: ' + (err.message || 'Unknown error'));
    }
  };

  const handleCancel = () => {
    setFormData({
      category: 'newsletter',
      type: 'newsletter',
      is_published: true,
      featured: false
    });
    setEditingId(null);
    setIsAddingNew(false);
  };

  const handleTogglePublish = async (id: string) => {
    try {
      await newsAPI.togglePublish(id);
      await fetchNewsletters();
      await fetchStats();
    } catch (err: any) {
      console.error('Error toggling publish status:', err);
      alert('Failed to update status');
    }
  };

  const handleToggleFeatured = async (id: string) => {
    try {
      await newsAPI.toggleFeatured(id);
      await fetchNewsletters();
      await fetchStats();
    } catch (err: any) {
      console.error('Error toggling featured status:', err);
      alert('Failed to update status');
    }
  };

  const filteredNewsletters = selectedCategory === "all" 
    ? newsletters 
    : newsletters.filter(n => n.category === selectedCategory);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { 
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading newsletters...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-red-900 mb-2">Error Loading Newsletters</h3>
        <p className="text-red-700 mb-4">{error}</p>
        <Button onClick={fetchNewsletters}>Try Again</Button>
      </div>
    );
  }

  return (
    <div>
      {/* Header with Stats */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Newspaper className="text-primary" />
            Newsletter & Reports Management ({newsletters.length})
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage AFOSI newsletters and annual reports
          </p>
        </div>
        <Button 
          onClick={() => setIsAddingNew(true)}
          className="flex items-center gap-2"
          disabled={isAddingNew || editingId !== null}
        >
          <Plus size={18} />
          Add Newsletter/Report
        </Button>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-card rounded-lg p-4 border border-border">
            <div className="text-2xl font-bold text-foreground">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total Items</div>
          </div>
          <div className="bg-card rounded-lg p-4 border border-border">
            <div className="text-2xl font-bold text-green-600">{stats.published}</div>
            <div className="text-sm text-muted-foreground">Published</div>
          </div>
          <div className="bg-card rounded-lg p-4 border border-border">
            <div className="text-2xl font-bold text-orange-600">{stats.featured || 0}</div>
            <div className="text-sm text-muted-foreground">Featured</div>
          </div>
          <div className="bg-card rounded-lg p-4 border border-border">
            <div className="text-2xl font-bold text-primary">{stats.totalViews || 0}</div>
            <div className="text-sm text-muted-foreground">Total Views</div>
          </div>
        </div>
      )}

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setSelectedCategory("all")}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            selectedCategory === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-accent text-foreground hover:bg-accent/80"
          }`}
        >
          All ({newsletters.length})
        </button>
        {categories.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setSelectedCategory(cat.value)}
            className={`px-4 py-2 rounded-lg font-semibold capitalize transition-colors ${
              selectedCategory === cat.value
                ? "bg-primary text-primary-foreground"
                : "bg-accent text-foreground hover:bg-accent/80"
            }`}
          >
            {cat.label} ({newsletters.filter(n => n.category === cat.value).length})
          </button>
        ))}
      </div>

      {/* Add/Edit Form */}
      {(isAddingNew || editingId) && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl border-2 border-primary p-6 mb-6"
        >
          <h3 className="text-xl font-heading font-bold mb-4">
            {editingId ? 'Edit Newsletter/Report' : 'Add New Newsletter/Report'}
          </h3>
          
          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-semibold mb-2">Title *</label>
              <input
                type="text"
                value={formData.title || ''}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary"
                placeholder="e.g., June 2024 Newsletter"
              />
            </div>

            {/* Slug */}
            <div>
              <label className="block text-sm font-semibold mb-2">Slug * (Auto-generated URL)</label>
              <input
                type="text"
                value={formData.slug || ''}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary font-mono text-sm bg-accent"
                placeholder="june-2024-newsletter"
                readOnly
              />
            </div>

            {/* Excerpt */}
            <div>
              <label className="block text-sm font-semibold mb-2">Short Description *</label>
              <textarea
                value={formData.excerpt || ''}
                onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary"
                rows={3}
                placeholder="Brief description of this newsletter/report"
              />
            </div>

            {/* Content (Optional) */}
            <div>
              <label className="block text-sm font-semibold mb-2">Full Description (Optional)</label>
              <textarea
                value={formData.content || ''}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary"
                rows={5}
                placeholder="Detailed description (optional, will use short description if empty)"
              />
            </div>

            {/* Cover Image Upload */}
            <div>
              <label className="block text-sm font-semibold mb-2">Cover Image</label>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="newsletter-image-upload"
              />
              <label
                htmlFor="newsletter-image-upload"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
              >
                {formData.image_url ? (
                  <div className="relative w-full h-full">
                    <img src={formData.image_url} alt="Preview" className="w-full h-full object-contain rounded-lg" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setFormData({ ...formData, image_url: undefined });
                      }}
                      className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {uploading ? 'Uploading...' : 'Click to upload cover image'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Max 20MB</p>
                  </div>
                )}
              </label>
            </div>

            {/* PDF Upload */}
            <div>
              <label className="block text-sm font-semibold mb-2">PDF File * (Required)</label>
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf"
                onChange={handlePdfUpload}
                className="hidden"
                id="newsletter-pdf-upload"
              />
              <label
                htmlFor="newsletter-pdf-upload"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
              >
                {formData.pdf_url ? (
                  <div className="text-center">
                    <FileText className="w-12 h-12 text-green-600 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-green-600">PDF Uploaded</p>
                    <p className="text-xs text-muted-foreground mt-1">{formData.pdf_url.split('/').pop()}</p>
                    <div className="flex gap-2 mt-2 justify-center">
                      <a
                        href={formData.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        View PDF
                      </a>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setFormData({ ...formData, pdf_url: undefined });
                        }}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {uploadingPdf ? 'Uploading PDF...' : 'Click to upload PDF file'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Max 100MB</p>
                  </div>
                )}
              </label>
            </div>

            {/* Row: Category, Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Category *</label>
                <select
                  value={formData.category || 'newsletter'}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary"
                >
                  {categories.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Published Date *</label>
                <input
                  type="date"
                  value={formData.published_date || ''}
                  onChange={(e) => setFormData({ ...formData, published_date: e.target.value })}
                  className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_published !== false}
                  onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-semibold">Published (visible on website)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.featured || false}
                  onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-semibold">Featured (show on homepage)</span>
              </label>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-4">
              <Button onClick={handleSave} className="flex items-center gap-2">
                <Save size={16} />
                {editingId ? 'Update' : 'Create'}
              </Button>
              <Button onClick={handleCancel} variant="outline" className="flex items-center gap-2">
                <X size={16} />
                Cancel
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Newsletter List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredNewsletters.length === 0 ? (
          <div className="text-center py-12 bg-accent rounded-lg">
            <Newspaper className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No newsletters found. Add your first one!</p>
          </div>
        ) : (
          filteredNewsletters.map((newsletter) => {
            const categoryInfo = categories.find(c => c.value === newsletter.category);

            return (
              <motion.div
                key={newsletter.id}
                layout
                className="bg-card rounded-xl border border-border overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col md:flex-row gap-4 p-4">
                  {/* Image */}
                  {newsletter.image_url && (
                    <div className="w-full md:w-48 h-32 flex-shrink-0">
                      <img
                        src={newsletter.image_url}
                        alt={newsletter.title}
                        className="w-full h-full object-cover rounded-lg"
                      />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge className={categoryInfo?.color}>
                            {categoryInfo?.label}
                          </Badge>
                          {newsletter.pdf_url && (
                            <Badge className="bg-primary text-primary-foreground">
                              <FileText size={12} className="mr-1" />
                              PDF
                            </Badge>
                          )}
                          {newsletter.is_published ? (
                            <Badge className="bg-green-100 text-green-700">
                              <Eye size={12} className="mr-1" />
                              Published
                            </Badge>
                          ) : (
                            <Badge className="bg-orange-100 text-orange-700">
                              <EyeOff size={12} className="mr-1" />
                              Draft
                            </Badge>
                          )}
                          {newsletter.featured && (
                            <Badge className="bg-yellow-100 text-yellow-700">
                              <Star size={12} className="mr-1" />
                              Featured
                            </Badge>
                          )}
                        </div>
                        <h3 className="text-lg font-heading font-bold text-foreground mb-1 line-clamp-1">
                          {newsletter.title}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                          {newsletter.excerpt}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {formatDate(newsletter.published_date)}
                          </span>
                          <span>{newsletter.views} views</span>
                          {newsletter.pdf_url && (
                            <a
                              href={newsletter.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-primary hover:underline"
                            >
                              <Download size={12} />
                              View PDF
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex md:flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleFeatured(newsletter.id)}
                      title={newsletter.featured ? "Remove from featured" : "Mark as featured"}
                    >
                      {newsletter.featured ? <StarOff size={16} /> : <Star size={16} />}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTogglePublish(newsletter.id)}
                      title={newsletter.is_published ? "Unpublish" : "Publish"}
                    >
                      {newsletter.is_published ? <EyeOff size={16} /> : <Eye size={16} />}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(newsletter)}
                    >
                      <Edit2 size={16} />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(newsletter.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default NewsAdminPanel;
