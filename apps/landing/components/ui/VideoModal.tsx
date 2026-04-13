"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

type VideoModalProps = {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
};

export function VideoModal({ isOpen, onClose, videoId }: VideoModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 modal-shell flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Enclave demo video"
        >
          <motion.div
            className="modal-card bg-surface rounded-2xl overflow-hidden w-full max-w-3xl"
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aspect-video">
              {videoId ? (
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
                  allow="autoplay; fullscreen; encrypted-media"
                  allowFullScreen
                  className="w-full h-full"
                  title="Enclave demo video"
                />
              ) : (
                <div className="flex items-center justify-center w-full h-full text-ink-500 text-sm">
                  Demo video unavailable. Watch on YouTube →
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
