import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useImageUpload } from '../hooks/useImageUpload';
import { gqlRequest } from '../lib/gql';

interface Project {
  id: string;
  name: string;
  created_at: string;
  original_image: { url: string } | null;
}

const GET_PROJECTS = `
  query GetProjects($accountId: bigint!) {
    image_project(
      where: {
        _eq: {
          bigint_operand: {
            left_operand: { column: account_id }
            right_operand: { literal: $accountId }
          }
        }
      }
      order_by: [{ created_at: desc }]
    ) {
      id
      name
      created_at
      original_image { url }
    }
  }
`;

const CREATE_PROJECT = `
  mutation CreateProject($name: String!, $originalImageId: bigint!, $accountId: bigint!) {
    insert_image_project_one(object: {
      name: $name
      original_image_id: $originalImageId
      account_id: $accountId
    }) {
      id name created_at original_image { url }
    }
  }
`;

interface DashboardPageProps {
  onSelectProject: (id: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onSelectProject }) => {
  const { accountId, username, logout, token } = useAuth();
  const { uploadImage } = useImageUpload();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProjects = useCallback(async () => {
    if (!accountId) return;
    setLoadingProjects(true);
    try {
      const data = await gqlRequest<{ image_project: Project[] }>(
        GET_PROJECTS, { accountId: Number(accountId) }, token
      );
      setProjects(data.image_project);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProjects(false);
    }
  }, [accountId, token]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file?.type.startsWith('image/')) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const closeModal = () => {
    setShowCreate(false);
    setPreviewUrl(null);
    setSelectedFile(null);
    setProjectName('');
    setCreateError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !accountId) return;
    setCreateError('');
    setCreating(true);
    try {
      const { imageId } = await uploadImage(selectedFile);
      await gqlRequest(CREATE_PROJECT, {
        name: projectName || selectedFile.name,
        originalImageId: imageId,
        accountId: Number(accountId),
      }, token);
      closeModal();
      fetchProjects();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
            </div>
            <span className="text-white font-semibold">Image Editor</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-slate-400 text-sm">
              Signed in as <span className="text-white">{username}</span>
            </span>
            <button onClick={logout} className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">My Projects</h2>
            <p className="text-slate-400 text-sm mt-1">Upload images and edit them with AI</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Project
          </button>
        </div>

        {loadingProjects ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => <div key={i} className="bg-slate-800/50 rounded-2xl h-56 animate-pulse" />)}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-24">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 mb-4">
              <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Z" />
              </svg>
            </div>
            <p className="text-slate-400 font-medium mb-1">No projects yet</p>
            <p className="text-slate-600 text-sm mb-4">Create your first project to get started</p>
            <button onClick={() => setShowCreate(true)} className="text-purple-400 hover:text-purple-300 text-sm transition-colors">
              Create a project →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelectProject(p.id)}
                className="group bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 rounded-2xl overflow-hidden transition-all text-left"
              >
                <div className="h-40 bg-slate-700/30 overflow-hidden">
                  {p.original_image?.url ? (
                    <img src={p.original_image.url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-white font-medium truncate">{p.name}</p>
                  <p className="text-slate-500 text-xs mt-1">{fmt(p.created_at)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
              <h3 className="text-white font-semibold text-lg">New Project</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Project Name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="My awesome project"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Original Image</label>
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-purple-500/50 rounded-xl p-6 cursor-pointer transition-colors text-center"
                >
                  {previewUrl ? (
                    <img src={previewUrl} alt="Preview" className="max-h-48 mx-auto rounded-lg object-contain" />
                  ) : (
                    <div>
                      <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                      </svg>
                      <p className="text-slate-400 text-sm">Drop an image or <span className="text-purple-400">browse</span></p>
                      <p className="text-slate-600 text-xs mt-1">PNG, JPG, WEBP</p>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                </div>
                {selectedFile && (
                  <p className="text-slate-500 text-xs mt-2">{selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</p>
                )}
              </div>

              {createError && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{createError}</p>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedFile || creating}
                  className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
                >
                  {creating ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Uploading…
                    </span>
                  ) : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
