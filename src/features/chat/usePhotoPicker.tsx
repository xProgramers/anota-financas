import { Camera, Images, X } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';

function isTouchDevice() {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Escolha da foto do comprovante.
 * Celular/tablet: pergunta se quer abrir a câmera ou a galeria.
 * Computador: abre direto o seletor de arquivos.
 */
export function usePhotoPicker(onFile: (file: File) => void) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheetOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  function open() {
    if (isTouchDevice()) setSheetOpen(true);
    else galleryRef.current?.click();
  }

  function pick(which: 'camera' | 'gallery') {
    setSheetOpen(false);
    (which === 'camera' ? cameraRef : galleryRef).current?.click();
  }

  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite escolher a mesma foto de novo
    if (file) onFile(file);
  };

  const element = (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handle} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handle} />
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Foto do comprovante">
          <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Fechar" onClick={() => setSheetOpen(false)} />
          <div className="sheet-in relative w-full max-w-md rounded-t-3xl bg-surface px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden />
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="text-base font-semibold">Foto da nota ou cupom</p>
              <button type="button" onClick={() => setSheetOpen(false)} className="rounded-full p-1.5 text-muted hover:bg-ink/5" aria-label="Cancelar">
                <X className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => pick('camera')}
                className="flex flex-col items-center gap-2 rounded-2xl bg-brand px-4 py-5 text-brand-ink transition active:scale-[0.98]"
                autoFocus
              >
                <Camera className="size-7" aria-hidden />
                <span className="text-[15px] font-semibold">Tirar foto</span>
              </button>
              <button
                type="button"
                onClick={() => pick('gallery')}
                className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-paper px-4 py-5 text-ink transition active:scale-[0.98]"
              >
                <Images className="size-7 text-brand" aria-hidden />
                <span className="text-[15px] font-semibold">Escolher da galeria</span>
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-muted">A foto é usada só para ler o valor e é descartada em seguida.</p>
          </div>
        </div>
      )}
    </>
  );

  return { open, element };
}
