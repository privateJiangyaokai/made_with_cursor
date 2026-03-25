import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { gqlRequest } from '../lib/gql';
import { subscribeToActionFlow } from '../lib/wsSubscription';

interface HistoryEntry {
  id: string;
  prompt: string;
  created_at: string;
  result_image: { url: string } | null;
}

interface Project {
  id: string;
  name: string;
  original_image: { url: string; id: string } | null;
}

interface ProjectPageProps {
  projectId: string;
  onBack: () => void;
}

type EditStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'failed';

const GET_PROJECT = `
  query GetProject($id: bigint!) {
    image_project_by_pk(id: $id) {
      id name
      original_image { url id }
    }
  }
`;

const GET_HISTORY = `
  query GetEditingHistory($projectId: bigint!) {
    editing_history(
      where: {
        _eq: {
          bigint_operand: {
            left_operand: { column: project_id }
            right_operand: { literal: $projectId }
          }
        }
      }
      order_by: [{ created_at: desc }]
    ) {
      id prompt created_at
      result_image { url }
    }
  }
`;

const INVOKE_EDIT = `
  mutation InvokeEditImage($args: Json!) {
    fz_create_action_flow_task(
      actionFlowId: "48555c8f-bcf7-489e-a423-7fdc0c4dc293"
      versionId: -1
      args: $args
    )
  }
`;

const Spinner = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

export const ProjectPage: React.FC<ProjectPageProps> = ({ projectId, onBack }) => {
  const { token } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loadingProject, setLoadingProject] = useState(true);
  const [instruction, setInstruction] = useState('');
  const [editStatus, setEditStatus] = useState<EditStatus>('idle');
  const [editError, setEditError] = useState('');
  const [viewingImage, setViewingImage] = useState<{ url: string; prompt?: string } | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const fetchProject = useCallback(async () => {
    try {
      const data = await gqlRequest<{ image_project_by_pk: Project }>(
        GET_PROJECT, { id: Number(projectId) }, token
      );
      setProject(data.image_project_by_pk);
    } catch (e) { console.error(e); }
    finally { setLoadingProject(false); }
  }, [projectId, token]);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await gqlRequest<{ editing_history: HistoryEntry[] }>(
        GET_HISTORY, { projectId: Number(projectId) }, token
      );
      setHistory(data.editing_history);
    } catch (e) { console.error(e); }
  }, [projectId, token]);

  useEffect(() => {
    fetchProject();
    fetchHistory();
  }, [fetchProject, fetchHistory]);

  // Clean up WebSocket on unmount
  useEffect(() => () => { unsubRef.current?.(); }, []);

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction.trim()) return;
    setEditError('');
    setEditStatus('pending');

    try {
      const data = await gqlRequest<{ fz_create_action_flow_task: number }>(
        INVOKE_EDIT,
        { args: { edit_instruction: instruction, image_project_id: Number(projectId) } },
        token
      );
      const taskId = data.fz_create_action_flow_task;
      setInstruction('');
      setEditStatus('processing');

      // Clean up previous subscription
      unsubRef.current?.();

      unsubRef.current = subscribeToActionFlow<{ output: { editing_history_id?: number }; status: string }>(
        Number(taskId),
        token,
        (result, status) => {
          if (status === 'PROCESSING') {
            setEditStatus('processing');
          } else if (status === 'COMPLETED') {
            setEditStatus('completed');
            fetchHistory().then(() => {
              // Auto-select the new result from history
              if (result.output?.editing_history_id) {
                // Slight delay to let history re-render
                setTimeout(() => {
                  setHistory((prev) => {
                    const found = prev.find((h) => h.id === String(result.output.editing_history_id));
                    if (found?.result_image?.url) {
                      setViewingImage({ url: found.result_image.url, prompt: found.prompt ?? undefined });
                    }
                    return prev;
                  });
                }, 300);
              }
            });
          } else if (status === 'FAILED') {
            setEditStatus('failed');
            setEditError('AI editing failed. Please try again.');
          }
        },
        (err) => {
          setEditStatus('failed');
          setEditError(err);
        }
      );
    } catch (err) {
      setEditStatus('failed');
      setEditError(err instanceof Error ? err.message : 'Failed to start editing');
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  if (loadingProject) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400"><Spinner /> Loading project…</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-4">Project not found</p>
          <button onClick={onBack} className="text-purple-400 hover:text-purple-300 transition-colors">← Back</button>
        </div>
      </div>
    );
  }

  const isProcessing = editStatus === 'pending' || editStatus === 'processing';
  const currentImageUrl = viewingImage?.url ?? project.original_image?.url;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <button onClick={onBack} className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back
          </button>
          <div className="w-px h-4 bg-slate-700" />
          <h1 className="text-white font-semibold">{project.name}</h1>
          {isProcessing && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Spinner /> Processing…
            </span>
          )}
          {editStatus === 'completed' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
              ✓ Done
            </span>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden max-w-7xl mx-auto w-full px-6 py-6 gap-6">
        {/* Left: Image + editor */}
        <div className="flex-1 flex flex-col gap-5 min-w-0">
          {/* Image viewer */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col" style={{ minHeight: 0, flex: 1 }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
              <span className="text-slate-400 text-sm">
                {viewingImage ? (
                  <>
                    <span className="text-purple-400">Edited</span>
                    {viewingImage.prompt && <span className="text-slate-600"> · "{viewingImage.prompt.length > 50 ? viewingImage.prompt.slice(0, 50) + '…' : viewingImage.prompt}"</span>}
                  </>
                ) : 'Original image'}
              </span>
              {viewingImage && (
                <button onClick={() => setViewingImage(null)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                  View original
                </button>
              )}
            </div>
            <div className="flex-1 flex items-center justify-center p-4 relative" style={{ background: 'repeating-conic-gradient(#1e1e2e 0% 25%, #252535 0% 50%) 0 0 / 32px 32px', minHeight: 300 }}>
              {isProcessing && (
                <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center z-10">
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-500/20 border border-purple-500/30 mb-3">
                      <Spinner className="w-5 h-5 text-purple-400" />
                    </div>
                    <p className="text-white font-medium text-sm">AI is editing your image…</p>
                    <p className="text-slate-400 text-xs mt-1">This may take a moment</p>
                  </div>
                </div>
              )}
              {currentImageUrl ? (
                <img src={currentImageUrl} alt="Current" className="max-h-[52vh] max-w-full object-contain rounded-lg shadow-xl" />
              ) : (
                <p className="text-slate-600 text-sm">No image</p>
              )}
            </div>
          </div>

          {/* Edit form */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shrink-0">
            <h3 className="text-white font-medium mb-3 text-sm">Edit with AI</h3>
            <form onSubmit={handleEdit} className="flex gap-3">
              <input
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                disabled={isProcessing}
                placeholder='e.g. "Make the sky more dramatic" or "Remove the background"'
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition disabled:opacity-50 text-sm"
              />
              <button
                type="submit"
                disabled={!instruction.trim() || isProcessing}
                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-5 py-3 rounded-xl transition-colors flex items-center gap-2 shrink-0 text-sm"
              >
                {isProcessing ? <><Spinner /> Processing</> : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                    </svg>
                    Edit
                  </>
                )}
              </button>
            </form>
            {editError && <p className="text-red-400 text-xs mt-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{editError}</p>}
            {editStatus === 'completed' && <p className="text-green-400 text-xs mt-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">✓ Edit completed — result saved to history</p>}
          </div>
        </div>

        {/* Right: History panel */}
        <div className="w-72 shrink-0 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 shrink-0">
            <h3 className="text-white font-medium text-sm">Edit History</h3>
            <p className="text-slate-500 text-xs mt-0.5">{history.length} edit{history.length !== 1 ? 's' : ''}</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Original */}
            <button
              onClick={() => setViewingImage(null)}
              className={`w-full flex gap-3 p-3 hover:bg-slate-800/50 transition-colors text-left border-b border-slate-800/50 ${!viewingImage ? 'bg-slate-800/30' : ''}`}
            >
              {project.original_image?.url && (
                <img src={project.original_image.url} alt="Original" className="w-14 h-14 rounded-lg object-cover shrink-0 border border-slate-700" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-slate-300 text-xs font-medium">Original</p>
                <p className="text-slate-500 text-xs mt-0.5 truncate">{project.name}</p>
              </div>
              {!viewingImage && <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0 mt-2" />}
            </button>

            {/* Loading indicator during processing */}
            {isProcessing && (
              <div className="flex gap-3 p-3 border-b border-slate-800/50 bg-slate-800/20">
                <div className="w-14 h-14 rounded-lg bg-slate-700/50 border border-slate-700 flex items-center justify-center shrink-0">
                  <Spinner className="w-4 h-4 text-purple-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-slate-400 text-xs line-clamp-2 italic">Processing edit…</p>
                  <p className="text-slate-600 text-xs mt-1">Just now</p>
                </div>
              </div>
            )}

            {history.length === 0 && !isProcessing ? (
              <div className="p-4 text-center">
                <p className="text-slate-600 text-xs">No edits yet. Use the editor above to get started.</p>
              </div>
            ) : (
              history.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => entry.result_image?.url && setViewingImage({ url: entry.result_image.url, prompt: entry.prompt ?? undefined })}
                  className={`w-full flex gap-3 p-3 hover:bg-slate-800/50 transition-colors text-left border-b border-slate-800/50 ${viewingImage?.url === entry.result_image?.url ? 'bg-slate-800/30' : ''}`}
                >
                  <div className="w-14 h-14 rounded-lg bg-slate-700/50 overflow-hidden shrink-0 border border-slate-700">
                    {entry.result_image?.url ? (
                      <img src={entry.result_image.url} alt={entry.prompt ?? ''} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Spinner /></div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-300 text-xs leading-snug line-clamp-2">{entry.prompt}</p>
                    <p className="text-slate-600 text-xs mt-1">{fmt(entry.created_at)}</p>
                  </div>
                  {viewingImage?.url === entry.result_image?.url && (
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0 mt-2" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
