import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Edit2, Save, X, Image as ImageIcon, AlertCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { galleryAPI, uploadAPI } from "@/services/api";

interface GalleryImage {
  id: string;
  src: string;
  category: string;
  alt: string;
  featured?: boolean;
}

const categories = ["Programs", "Community", "Youth", "Events", "Environment", "Partners", "Projects"];

const GalleryAdminPanel = () => {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<GalleryImage>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [uploadMode, setUploadMode] = useState<'single' | 'multiple'>('single');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchImages();
  }, []);

  // Cleanup object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const fetchImages = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await galleryAPI.getAll();
      setImages(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch gallery images');
      console.error('Error fetching images:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const maxSize = 50 * 1024 * 1024; // 50MB in bytes (Supabase limit)
    
    // Check file sizes
    const oversizedFiles = fileArray.filter(file => file.size > maxSize);
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(2)}MB)`).join(', ');
      alert(`The following files exceed 50MB limit:\n${fileNames}\n\nPlease compress or resize these images before uploading.\n\nNote: Supabase has a 50MB per file limit.`);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Revoke old preview URLs before creating new ones
    previewUrls.forEach(url => URL.revokeObjectURL(url));

    setSelectedFiles(fileArray);

    // Create preview URLs
    const urls = fileArray.map(file => URL.createObjectURL(file));
    setPreviewUrls(urls);
  };

  const handleUploadSingle = async () => {
    if (selectedFiles.length === 0) {
      alert('Please select an image file');
      return;
    }

    const file = selectedFiles[0];
    const category = formData.category || 'programs';
    const alt = formData.alt || '';

    if (!alt || alt.trim() === '') {
      alert('Please enter a description for the image');
      return;
    }

    try {
      setUploading(true);

      // Upload image to Supabase Storage
      const uploadResponse = await uploadAPI.uploadImage(file);
      
      // Create gallery entry with uploaded image URL
      const response = await galleryAPI.create({
        src: uploadResponse.data.url,
        category: category as 'programs' | 'events' | 'projects',
        alt: alt
      });

      setImages([response.data, ...images]);
      setIsAddingNew(false);
      setFormData({});
      setSelectedFiles([]);
      setPreviewUrls([]);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      alert('Image uploaded successfully!');
    } catch (err: any) {
      alert('Failed to upload: ' + err.message);
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadMultiple = async () => {
    if (selectedFiles.length === 0) {
      alert('Please select at least one image file');
      return;
    }

    const category = formData.category || 'programs';

    try {
      setUploading(true);
      let successCount = 0;
      let failCount = 0;

      // Upload each file
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const alt = formData.alt || `${category} image ${i + 1}`;

        try {
          // Upload image to Supabase Storage
          const uploadResponse = await uploadAPI.uploadImage(file);
          
          // Create gallery entry with uploaded image URL
          const response = await galleryAPI.create({
            src: uploadResponse.data.url,
            category: category as 'programs' | 'events' | 'projects',
            alt: `${alt} - ${file.name}`
          });

          setImages(prev => [response.data, ...prev]);
          successCount++;
        } catch (err) {
          console.error(`Failed to upload ${file.name}:`, err);
          failCount++;
        }
      }

      setIsAddingNew(false);
      setFormData({});
      setSelectedFiles([]);
      setPreviewUrls([]);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (failCount === 0) {
        alert(`Successfully uploaded ${successCount} image(s)!`);
      } else {
        alert(`Uploaded ${successCount} image(s). Failed: ${failCount}`);
      }
    } catch (err: any) {
      alert('Failed to upload images: ' + err.message);
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadAndSave = async () => {
    if (uploadMode === 'single') {
      await handleUploadSingle();
    } else if (uploadMode === 'multiple') {
      await handleUploadMultiple();
    }
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        // Ensure category is properly typed
        const updateData: Partial<{
          src: string;
          category: 'programs' | 'events' | 'projects';
          alt: string;
        }> = {
          ...formData,
          category: formData.category as 'programs' | 'events' | 'projects'
        };
        const response = await galleryAPI.update(editingId, updateData);
        setImages(images.map(img => 
          img.id === editingId ? response.data : img
        ));
        setEditingId(null);
      } else if (isAddingNew) {
        // Use upload function instead
        await handleUploadAndSave();
        return;
      }
      setFormData({});
    } catch (err: any) {
      alert('Failed to save: ' + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this image?')) {
      try {
        await galleryAPI.delete(id);
        setImages(images.filter(img => img.id !== id));
      } catch (err: any) {
        alert('Failed to delete: ' + err.message);
      }
    }
  };

  const handleEdit = (img: GalleryImage) => {
    setEditingId(img.id);
    setFormData(img);
  };

  const handleCancel = () => {
    // Revoke object URLs before clearing
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    
    setEditingId(null);
    setIsAddingNew(false);
    setFormData({});
    setSelectedFiles([]);
    setPreviewUrls([]);
    setUploadMode('single');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Memoize filtered images to prevent unnecessary recalculations
  const filteredImages = useMemo(() => {
    return selectedCategory === "all" 
      ? images 
      : images.filter(img => img.category === selectedCategory);
  }, [selectedCategory, images]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading gallery images...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-red-900 mb-2">Error Loading Gallery</h3>
        <p className="text-red-700 mb-4">{error}</p>
        <Button onClick={fetchImages}>Try Again</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">
            Gallery Images ({images.length})
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage images displayed on the gallery page
          </p>
        </div>
        <Button 
          onClick={() => setIsAddingNew(true)}
          className="flex items-center gap-2"
          disabled={isAddingNew || editingId !== null}
        >
          <Plus size={18} />
          Add New Image
        </Button>
      </div>

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
          All ({images.length})
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-lg font-semibold capitalize transition-colors ${
              selectedCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-accent text-foreground hover:bg-accent/80"
            }`}
          >
            {cat} ({images.filter(img => img.category === cat).length})
          </button>
        ))}
      </div>

      {/* Add New Form */}
      {isAddingNew && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl border-2 border-primary p-6 mb-6"
        >
          <h3 className="text-xl font-heading font-bold mb-4">Add New Image(s)</h3>
          <ImageForm 
            data={formData} 
            onChange={setFormData}
            onSave={handleSave}
            onCancel={handleCancel}
            isNew={true}
            selectedFiles={selectedFiles}
            previewUrls={previewUrls}
            onFileSelect={handleFileSelect}
            uploading={uploading}
            fileInputRef={fileInputRef}
            uploadMode={uploadMode}
            onUploadModeChange={setUploadMode}
          />
        </motion.div>
      )}

      {/* Images Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredImages.map((image) => {
          const isEditing = editingId === image.id;

          return (
            <motion.div
              key={image.id}
              layout
              className="bg-card rounded-xl border border-border overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              {isEditing ? (
                <div className="p-4">
                  <ImageForm 
                    data={formData} 
                    onChange={setFormData}
                    onSave={handleSave}
                    onCancel={handleCancel}
                    isNew={false}
                  />
                </div>
              ) : (
                <>
                  <div className="aspect-square overflow-hidden bg-muted">
                    <img
                      src={image.src}
                      alt={image.alt}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "/placeholder.svg";
                      }}
                    />
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="capitalize">{image.category}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {image.alt}
                    </p>
                    <p className="text-xs text-muted-foreground mb-3 truncate">
                      {image.src}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(image)}
                        disabled={isAddingNew || editingId !== null}
                        className="flex-1"
                      >
                        <Edit2 size={14} />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(image.id)}
                        className="flex-1 border-red-500 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          );
        })}
      </div>

      {filteredImages.length === 0 && (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <ImageIcon className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground text-lg">No images found in this category</p>
        </div>
      )}
    </div>
  );
};

const ImageForm = ({ 
  data, 
  onChange, 
  onSave, 
  onCancel,
  isNew = false,
  selectedFiles,
  previewUrls,
  onFileSelect,
  uploading = false,
  fileInputRef,
  uploadMode,
  onUploadModeChange
}: { 
  data: Partial<GalleryImage>; 
  onChange: (data: Partial<GalleryImage>) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew?: boolean;
  selectedFiles?: File[];
  previewUrls?: string[];
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploading?: boolean;
  fileInputRef?: React.RefObject<HTMLInputElement>;
  uploadMode?: 'single' | 'multiple';
  onUploadModeChange?: (mode: 'single' | 'multiple') => void;
}) => {
  return (
    <div className="space-y-4">
      {isNew && (
        <>
          {/* Upload Mode Toggle */}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => onUploadModeChange?.('single')}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-colors ${
                uploadMode === 'single'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent text-foreground hover:bg-accent/80'
              }`}
            >
              Single Upload
            </button>
            <button
              type="button"
              onClick={() => onUploadModeChange?.('multiple')}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-colors ${
                uploadMode === 'multiple'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent text-foreground hover:bg-accent/80'
              }`}
            >
              Multiple Upload
            </button>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              {uploadMode === 'single' ? 'Upload Image' : 'Upload Multiple Images'}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple={uploadMode === 'multiple'}
              onChange={onFileSelect}
              className="hidden"
              id="image-upload"
            />
            <label
              htmlFor="image-upload"
              className="flex flex-col items-center justify-center w-full min-h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors p-4"
            >
              {previewUrls && previewUrls.length > 0 ? (
                <div className="w-full">
                  {uploadMode === 'single' ? (
                    <img src={previewUrls[0]} alt="Preview" className="h-32 object-contain mx-auto" />
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {previewUrls.slice(0, 6).map((url, idx) => (
                        <img key={idx} src={url} alt={`Preview ${idx + 1}`} className="h-20 w-full object-cover rounded" />
                      ))}
                      {previewUrls.length > 6 && (
                        <div className="h-20 flex items-center justify-center bg-accent rounded text-sm font-semibold">
                          +{previewUrls.length - 6} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {uploadMode === 'single' ? 'Click to upload image' : 'Click to upload multiple images'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WEBP (max 50MB each)</p>
                </div>
              )}
            </label>
            {selectedFiles && selectedFiles.length > 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                Selected: {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} 
                {selectedFiles.length === 1 && ` - ${selectedFiles[0].name}`}
              </p>
            )}
          </div>
        </>
      )}
      
      {!isNew && (
        <div>
          <label className="block text-sm font-semibold mb-2">Image URL</label>
          <input
            type="text"
            value={data.src || ''}
            onChange={(e) => onChange({ ...data, src: e.target.value })}
            className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary"
            placeholder="Image URL"
            disabled
          />
          <p className="text-xs text-muted-foreground mt-1">
            Image URL cannot be changed. Delete and upload new image instead.
          </p>
        </div>
      )}
      
      <div>
        <label className="block text-sm font-semibold mb-2">Category</label>
        <select
          value={data.category || 'Programs'}
          onChange={(e) => onChange({ ...data, category: e.target.value })}
          className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary"
        >
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={data.featured || false}
            onChange={(e) => onChange({ ...data, featured: e.target.checked })}
            className="w-4 h-4 rounded border-border focus:ring-2 focus:ring-primary"
          />
          <span className="text-sm font-semibold">Featured (show in carousel)</span>
        </label>
        <p className="text-xs text-muted-foreground mt-1">
          Featured images appear in the carousel on the gallery page
        </p>
      </div>
      <div>
        <label className="block text-sm font-semibold mb-2">Description</label>
        <input
          type="text"
          value={data.alt || ''}
          onChange={(e) => onChange({ ...data, alt: e.target.value })}
          className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary"
          placeholder={uploadMode === 'multiple' ? 'Base description (filename will be appended)' : 'Description of the image'}
        />
        {uploadMode === 'multiple' && (
          <p className="text-xs text-muted-foreground mt-1">
            Each image will get this description with its filename appended
          </p>
        )}
      </div>
      <div className="flex gap-2 pt-4">
        <Button onClick={onSave} className="flex items-center gap-2" disabled={uploading}>
          {uploading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Uploading...
            </>
          ) : (
            <>
              <Save size={16} />
              Save
            </>
          )}
        </Button>
        <Button onClick={onCancel} variant="outline" className="flex items-center gap-2" disabled={uploading}>
          <X size={16} />
          Cancel
        </Button>
      </div>
    </div>
  );
};

export default GalleryAdminPanel;
