import React, { useState } from 'react';
import { NotificationService, notificationService } from '../services/notificationService';
import { Lock, ShieldCheck, AlertCircle, KeyRound, X } from 'lucide-react';

interface AdminPinModalProps {
  isOpen: boolean;
  actionTitle: string;
  onAuthorized: () => void;
  onCancel: () => void;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  isOpen,
  actionTitle,
  onAuthorized,
  onCancel,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isValid = await NotificationService.verifyAdminPinSha256(pin);
    if (isValid) {
      setError(null);
      setPin('');
      onAuthorized();
    } else {
      setError('PIN de autorización incorrecto. Se requiere la credencial criptográfica de 4 dígitos autorizada.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border-2 border-emerald-500/50 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
          <KeyRound className="w-6 h-6" />
        </div>

        <div>
          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
            Regla ABAC • Autorización de Operación
          </span>
          <h3 className="text-base font-bold text-white mt-1">
            PIN de Seguridad (4 Dígitos)
          </h3>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Acción: <strong className="text-slate-200">{actionTitle}</strong>
          </p>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-center gap-2 text-left font-mono">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex justify-center">
            <input
              type="password"
              maxLength={4}
              required
              autoFocus
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                setPin(val);
                if (error) setError(null);
              }}
              placeholder="••••"
              className="w-36 text-center tracking-[12px] bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-2xl py-3 text-2xl font-mono text-white outline-none"
            />
          </div>

          <div className="text-[11px] text-slate-500 font-mono">
            Ingrese su credencial de 4 dígitos autorizada (Protocolo Criptográfico ABAC)
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                setPin('');
                setError(null);
                onCancel();
              }}
              className="flex-1 py-2 px-3 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md"
            >
              Autorizar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
