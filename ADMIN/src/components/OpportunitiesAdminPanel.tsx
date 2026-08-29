import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Plus, Edit2, Trash2, Save, X,
  Calendar, MapPin, Clock, AlertCircle, CheckCircle2,
  Mail, Link as LinkIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { opportunitiesAPI } from "@/services/api";
import { 
  isDeadlinePassed, 
  formatDeadline, 
  getOpportunityStatus,
  getDaysUntilDeadline 
} from "@/utils/opportunityHelpers";

interface OpportunityData {
  id: string;
  title: string;
  type: "consulting" | "employment" | "volunteering";
  description: string;
  location: string;
  duration: string;
  deadline: string | null;
  manually_disabled: boolean;
  slug?: string;
  full_description?: string;
  apply_link?: string;
}

const OpportunitiesAdminPanel = () => {
  const [opportunities, setOpportunities] = useState<OpportunityData[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [formData, setFormData] = useState<Partial<OpportunityData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOpportunities();
  }, []);

  const fetchOpportunities = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await opportunitiesAPI.getAll();
      setOpportunities(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch opportunities');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (id: string) => {
    try {
      const response = await opportunitiesAPI.toggleStatus(id);
      setOpportunities(opportunities.map(opp => 
        opp.id === id ? response.data : opp
      ));
    } catch (err: any) {
      alert('Failed to toggle status: ' + err.message);
    }
  };

  const handleEdit = (opp: OpportunityData) => {
    setEditingId(opp.id);
    setFormData({ ...opp });
  };

  const handleSave = async () => {
    try {
      const payload = {
        title: formData.title || '',
        type: (formData.type || 'employment') as "consulting" | "employment" | "volunteering",
        description: formData.description || '',
        location: formData.location || '',
        duration: formData.duration || '',
        deadline: formData.deadline || null, // null = "Open — No Deadline"
        slug: formData.slug || '',
        full_description: formData.full_description || '',
        apply_link: formData.apply_link || '',
      };

      if (!payload.title || !payload.description || !payload.location || !payload.duration) {
        alert('Please fill in all required fields: Title, Description, Location, and Duration.');
        return;
      }

      if (editingId) {
        const response = await opportunitiesAPI.update(editingId, payload);
        setOpportunities(opportunities.map(opp =>
          opp.id === editingId ? response.data : opp
        ));
        setEditingId(null);
      } else if (isAddingNew) {
        const response = await opportunitiesAPI.create(payload);
        setOpportunities([response.data, ...opportunities]);
        setIsAddingNew(false);
      }
      setFormData({});
    } catch (err: any) {
      alert('Failed to save: ' + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this opportunity?')) {
      try {
        await opportunitiesAPI.delete(id);
        setOpportunities(opportunities.filter(opp => opp.id !== id));
      } catch (err: any) {
        alert('Failed to delete: ' + err.message);
      }
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setIsAddingNew(false);
    setFormData({});
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading opportunities...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-red-900 mb-2">Error Loading Opportunities</h3>
        <p className="text-red-700 mb-4">{error}</p>
        <Button onClick={fetchOpportunities}>Try Again</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-heading font-bold text-foreground">
          All Opportunities ({opportunities.length})
        </h2>
        <Button 
          onClick={() => { setIsAddingNew(true); setFormData({ type: 'employment' }); }}
          className="flex items-center gap-2"
          disabled={isAddingNew || editingId !== null}
        >
          <Plus size={18} />
          Add New Opportunity
        </Button>
      </div>

      {isAddingNew && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl border-2 border-primary p-6 mb-6"
        >
          <h3 className="text-xl font-heading font-bold mb-4">Add New Opportunity</h3>
          <OpportunityForm 
            data={formData} 
            onChange={setFormData}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </motion.div>
      )}

      <div className="space-y-4">
        {opportunities.map((opp) => {
          const status = getOpportunityStatus(opp.deadline, opp.manually_disabled);
          const isExpired = isDeadlinePassed(opp.deadline);
          const daysLeft = getDaysUntilDeadline(opp.deadline);
          const isEditing = editingId === opp.id;

          return (
            <motion.div
              key={opp.id}
              layout
              className="bg-card rounded-xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              {isEditing ? (
                <div>
                  <h3 className="text-xl font-heading font-bold mb-4">Editing: {opp.title}</h3>
                  <OpportunityForm 
                    data={formData} 
                    onChange={setFormData}
                    onSave={handleSave}
                    onCancel={handleCancel}
                  />
                </div>
              ) : (
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <Badge className={
                          opp.type === 'consulting' ? 'bg-secondary' : 
                          opp.type === 'volunteering' ? 'bg-green-500 text-white' : 
                          'bg-primary'
                        }>
                          {opp.type}
                        </Badge>
                        <Badge className={status === 'open' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                          {status === 'open' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                          <span className="ml-1">{status}</span>
                        </Badge>
                        {!opp.deadline && (
                          <Badge className="bg-blue-100 text-blue-700">
                            <CheckCircle2 size={14} />
                            <span className="ml-1">No Deadline</span>
                          </Badge>
                        )}
                        {isExpired && (
                          <Badge className="bg-amber-100 text-amber-700">
                            <AlertCircle size={14} />
                            <span className="ml-1">Deadline Passed</span>
                          </Badge>
                        )}
                        {!isExpired && daysLeft <= 7 && (
                          <Badge className="bg-orange-100 text-orange-700">
                            <Clock size={14} />
                            <span className="ml-1">{daysLeft} days left</span>
                          </Badge>
                        )}
                      </div>
                      <h3 className="text-xl font-heading font-bold text-foreground mb-2">
                        {opp.title}
                      </h3>
                      <p className="text-muted-foreground text-sm mb-3">{opp.description}</p>
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin size={14} className="text-primary" />
                          {opp.location}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={14} className="text-primary" />
                          {opp.duration}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar size={14} className="text-primary" />
                          {formatDeadline(opp.deadline)}
                        </span>
                      </div>
                      {opp.full_description && (
                        <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                          <CheckCircle2 size={12} /> Full description added
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(opp)}
                        disabled={isAddingNew || editingId !== null}
                      >
                        <Edit2 size={16} />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleStatus(opp.id)}
                        className={opp.manually_disabled ? 'border-green-500 text-green-600' : 'border-red-500 text-red-600'}
                      >
                        {opp.manually_disabled ? 'Enable' : 'Disable'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(opp.id)}
                        className="border-red-500 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Simple Form Component ────────────────────────────────────────────────────

const CAREERS_EMAIL = 'mailto:careers@afosi.org';

const OpportunityForm = ({
  data,
  onChange,
  onSave,
  onCancel
}: {
  data: Partial<OpportunityData>;
  onChange: (data: Partial<OpportunityData>) => void;
  onSave: () => void;
  onCancel: () => void;
}) => {
  const generateSlug = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();

  const handleTitleChange = (title: string) => {
    const updates: Partial<OpportunityData> = { ...data, title };
    if (!data.slug || data.slug === generateSlug(data.title || '')) {
      updates.slug = generateSlug(title);
    }
    onChange(updates);
  };

  // Determine current application method from the stored apply_link value
  // Stored values:
  //   'mailto:careers@afosi.org'  → email
  //   'internal'                  → default built-in page
  //   anything else               → external URL
  const applyLink = data.apply_link || '';
  const currentMode =
    applyLink === 'internal'
      ? 'internal'
      : !applyLink || applyLink.startsWith('mailto:')
        ? 'email'
        : 'external';

  // The actual URL value when in external mode
  const formUrl = currentMode === 'external' ? applyLink : '';

  const handleMethodChange = (mode: 'email' | 'external' | 'internal', value?: string) => {
    if (mode === 'email') {
      onChange({ ...data, apply_link: CAREERS_EMAIL });
    } else if (mode === 'internal') {
      onChange({ ...data, apply_link: 'internal' });
    } else {
      // For external, store whatever URL was typed (or 'https://' as a starter)
      onChange({ ...data, apply_link: value !== undefined ? value : 'https://' });
    }
  };

  // Open-ended = deadline explicitly cleared to null via the "Open — No Deadline" option below.
  // (undefined/'' just means "not filled in yet" for a brand-new opportunity.)
  const isOpenEnded = data.deadline === null;

  const inputClass = "w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground";

  return (
    <div className="space-y-5">

      {/* Title + Type */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-1">Title <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={data.title || ''}
            onChange={(e) => handleTitleChange(e.target.value)}
            className={inputClass}
            placeholder="e.g. District Coordinator, CGP Project"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Type <span className="text-red-500">*</span></label>
          <select
            value={data.type || 'employment'}
            onChange={(e) => onChange({ ...data, type: e.target.value as "consulting" | "employment" | "volunteering" })}
            className={inputClass}
          >
            <option value="employment">Employment</option>
            <option value="consulting">Consulting</option>
            <option value="volunteering">Volunteering/Mentorship</option>
          </select>
        </div>
      </div>

      {/* Short Description */}
      <div>
        <label className="block text-sm font-semibold mb-1">
          Short Description <span className="text-red-500">*</span>
          <span className="text-muted-foreground font-normal ml-1 text-xs">(shown on listing card)</span>
        </label>
        <textarea
          value={data.description || ''}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          className={inputClass}
          rows={2}
          placeholder="One-line summary of the role"
        />
      </div>

      {/* Location, Duration */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-1">Location <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={data.location || ''}
            onChange={(e) => onChange({ ...data, location: e.target.value })}
            className={inputClass}
            placeholder="Nairobi, Kenya"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Duration <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={data.duration || ''}
            onChange={(e) => onChange({ ...data, duration: e.target.value })}
            className={inputClass}
            placeholder="Full-time / 3 months"
          />
        </div>
      </div>

      {/* Deadline: Set a Date vs Open (no deadline) */}
      <div>
        <label className="block text-sm font-semibold mb-3">
          Deadline
          <span className="text-muted-foreground font-normal ml-1 text-xs">(choose one)</span>
        </label>

        <div className="grid gap-3">

          {/* Option 1: Set a Deadline */}
          <button
            type="button"
            onClick={() => onChange({ ...data, deadline: isOpenEnded ? '' : (data.deadline || '') })}
            className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
              !isOpenEnded
                ? 'border-primary bg-primary/5 dark:bg-primary/10 shadow-sm'
                : 'border-border bg-background hover:border-primary/40'
            }`}
          >
            <div className={`mt-0.5 p-2 rounded-lg shrink-0 ${
              !isOpenEnded ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-600' : 'bg-muted text-muted-foreground'
            }`}>
              <Calendar size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-foreground">Set a Deadline</p>
                {!isOpenEnded && (
                  <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">Active</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                The opportunity automatically closes at the end of the selected date.
              </p>
              {!isOpenEnded && (
                <input
                  type="date"
                  value={data.deadline || ''}
                  onChange={(e) => onChange({ ...data, deadline: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className={`${inputClass} mt-3`}
                />
              )}
            </div>
          </button>

          {/* Option 2: Open — No Deadline */}
          <button
            type="button"
            onClick={() => onChange({ ...data, deadline: null })}
            className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
              isOpenEnded
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 shadow-sm'
                : 'border-border bg-background hover:border-emerald-400/50'
            }`}
          >
            <div className={`mt-0.5 p-2 rounded-lg shrink-0 ${
              isOpenEnded ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600' : 'bg-muted text-muted-foreground'
            }`}>
              <CheckCircle2 size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-foreground">Open — No Deadline</p>
                {isOpenEnded && (
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full shrink-0">Active</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Stays open indefinitely and never auto-closes. Use "Disable" on the list to close it manually.
              </p>
            </div>
          </button>

        </div>
      </div>

      {/* URL Slug */}
      <div>
        <label className="block text-sm font-semibold mb-1">
          URL Slug
          <span className="text-muted-foreground font-normal ml-1 text-xs">(auto-generated)</span>
        </label>
        <div className="flex items-center">
          <span className="px-3 py-2 bg-muted border border-r-0 border-border rounded-l-lg text-xs text-muted-foreground whitespace-nowrap">
            /opportunities/
          </span>
          <input
            type="text"
            value={data.slug || ''}
            onChange={(e) => onChange({ ...data, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
            className="flex-1 px-4 py-2 border border-border rounded-r-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-sm"
            placeholder="my-opportunity-slug"
          />
        </div>
      </div>

      {/* Application Method Toggle */}
      <div>
        <label className="block text-sm font-semibold mb-3">
          Application Method
          <span className="text-muted-foreground font-normal ml-1 text-xs">(choose how applicants apply)</span>
        </label>

        {/* Card-style selector */}
        <div className="grid gap-3">

          {/* Option 1: Email */}
          <button
            type="button"
            onClick={() => handleMethodChange('email')}
            className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
              currentMode === 'email'
                ? 'border-primary bg-primary/5 dark:bg-primary/10 shadow-sm'
                : 'border-border bg-background hover:border-primary/40'
            }`}
          >
            <div className={`mt-0.5 p-2 rounded-lg shrink-0 ${
              currentMode === 'email' ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-600' : 'bg-muted text-muted-foreground'
            }`}>
              <Mail size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-foreground">Email (careers@afosi.org)</p>
                {currentMode === 'email' && (
                  <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">Active</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                The Apply Now button opens the applicant's email app, pre-addressed to careers@afosi.org.
              </p>
            </div>
          </button>

          {/* Option 2: Default Page (Built-in Form) */}
          <button
            type="button"
            onClick={() => handleMethodChange('internal')}
            className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
              currentMode === 'internal'
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 shadow-sm'
                : 'border-border bg-background hover:border-emerald-400/50'
            }`}
          >
            <div className={`mt-0.5 p-2 rounded-lg shrink-0 ${
              currentMode === 'internal' ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600' : 'bg-muted text-muted-foreground'
            }`}>
              <CheckCircle2 size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-foreground">Default Page (Built-in Form)</p>
                {currentMode === 'internal' && (
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full shrink-0">Active</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Opens the AFOSI built-in application form page directly on the website. Submissions are emailed to careers@afosi.org via Resend.
              </p>
            </div>
          </button>

          {/* Option 3: External Form (URL) */}
          <button
            type="button"
            onClick={() => handleMethodChange('external', currentMode === 'external' ? formUrl : 'https://')}
            className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
              currentMode === 'external'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20 shadow-sm'
                : 'border-border bg-background hover:border-blue-400/50'
            }`}
          >
            <div className={`mt-0.5 p-2 rounded-lg shrink-0 ${
              currentMode === 'external' ? 'bg-blue-100 dark:bg-blue-950/40 text-blue-600' : 'bg-muted text-muted-foreground'
            }`}>
              <LinkIcon size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-foreground">External Online Form (URL)</p>
                {currentMode === 'external' && (
                  <span className="text-xs font-bold text-blue-600 bg-blue-100 dark:bg-blue-950/40 px-2 py-0.5 rounded-full shrink-0">Active</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Redirects applicants to a third-party form (Google Forms, Typeform, Microsoft Forms, etc.).
              </p>
            </div>
          </button>

        </div>

        {/* External URL input - shown only when External is selected */}
        {currentMode === 'external' && (
          <div className="mt-3 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl">
            <label className="block text-xs font-bold mb-2 text-blue-700 dark:text-blue-300 uppercase tracking-wide">
              🔗 Paste Your External Form URL
            </label>
            <input
              type="url"
              value={formUrl === 'https://' ? '' : formUrl}
              onChange={(e) => handleMethodChange('external', e.target.value || 'https://')}
              onFocus={(e) => { if (e.target.value === 'https://') e.target.select(); }}
              className={`${inputClass} border-blue-300 dark:border-blue-700 focus:ring-blue-500`}
              placeholder="https://forms.google.com/d/your-form-id"
              autoFocus
            />
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1.5">
              Supports Google Forms, Microsoft Forms, Typeform, JotForm, and any other URL.
            </p>
          </div>
        )}
      </div>

      {/* Full Description */}
      <div>
        <label className="block text-sm font-semibold mb-1">
          Full Description
          <span className="text-muted-foreground font-normal ml-1 text-xs">(shown on the detail page)</span>
        </label>
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-2 text-xs text-blue-800 dark:text-blue-200">
          <strong>Tip:</strong> Use plain text. Start each section with a heading like <code>OVERVIEW</code>, <code>RESPONSIBILITIES</code>, <code>REQUIREMENTS</code>, <code>BENEFITS</code>, <code>HOW TO APPLY</code>, each on its own line. Bullet points: start lines with <code>-</code> or <code>•</code>.
        </div>
        <textarea
          value={data.full_description || ''}
          onChange={(e) => onChange({ ...data, full_description: e.target.value })}
          className={`${inputClass} font-mono text-sm`}
          rows={18}
          placeholder={`OVERVIEW
Brief introduction to this opportunity and what makes it unique.

ABOUT THE ROLE
Describe the role, its purpose, and how it fits into the organization.

RESPONSIBILITIES
- Lead project planning and execution
- Manage team and stakeholder relationships
- Develop and implement strategies
- Monitor progress and report outcomes

REQUIREMENTS
- Bachelor's degree or equivalent experience
- 3+ years relevant work experience
- Strong leadership and communication skills

BENEFITS
- Competitive salary and benefits package
- Professional development opportunities
- Meaningful work with social impact

HOW TO APPLY
Submit your application through our online form. Include your CV and cover letter.`}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button onClick={onSave} className="flex items-center gap-2">
          <Save size={16} />
          Save Opportunity
        </Button>
        <Button onClick={onCancel} variant="outline" className="flex items-center gap-2">
          <X size={16} />
          Cancel
        </Button>
      </div>
    </div>
  );
};

export default OpportunitiesAdminPanel;
