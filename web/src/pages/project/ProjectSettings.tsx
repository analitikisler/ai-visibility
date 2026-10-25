// Project settings: brand details, engines + schedule (one form, one save), competitors (saved as you
// go), the read-only site key, and deleting the project (type the name to confirm).
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Trash2 } from 'lucide-react';
import type { EngineId, Project, Schedule } from '@shared/types';
import { CompetitorList, isDomain, normalizeDomain } from '@/components/competitors';
import { useProject } from '@/components/layout';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  ChipsInput,
  CodeBlock,
  ConfirmDialog,
  Input,
  ModeBadge,
  Page,
  PageHeader,
  Select,
  Textarea,
  UnsavedChangesGuard,
  useToast,
} from '@/components/ui';
import { copy, fmt } from '@/content/copy';
import { errorMessage, useDeleteProject, useEngines, useUpdateProject } from '@/lib/api';
import { ENGINE_IDS } from '@/lib/engines';

const PS = copy.pages.projectSettings;
const F = copy.pages.onboarding.fields;
const V = copy.pages.onboarding.validation;
const SCHEDULES: Schedule[] = ['daily', 'weekly', 'manual'];

interface FormState {
  name: string;
  domain: string;
  aliases: string[];
  description: string;
  industry: string;
  market: string;
  language: string;
  engines: EngineId[];
  schedule: Schedule;
}

const fromProject = (p: Project): FormState => ({
  name: p.name,
  domain: p.domain,
  aliases: p.aliases,
  description: p.description,
  industry: p.industry,
  market: p.market,
  language: p.language,
  engines: p.engines,
  schedule: p.schedule,
});

const same = (a: FormState, b: FormState) => JSON.stringify(a) === JSON.stringify(b);

function validate(f: FormState) {
  return {
    name: f.name.trim() ? null : V.nameRequired,
    domain: isDomain(f.domain) ? null : V.domainInvalid,
    market: f.market.trim().length >= 2 ? null : copy.app.errors.validation,
    engines: f.engines.length ? null : V.enginesRequired,
  };
}

function SettingsForm() {
  const { project, projectId } = useProject();
  const engines = useEngines();
  const update = useUpdateProject(projectId);
  const toast = useToast();
  const initial = useMemo(() => fromProject(project), [project]);
  const [f, setF] = useState<FormState>(initial);
  const [touched, setTouched] = useState(false);
  useEffect(() => setF(initial), [initial]);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const errors = validate(f);
  const invalid = Object.values(errors).some(Boolean);
  const dirty = !same(f, initial);
  const languages = copy.pages.onboarding.languages as Record<string, string>;
  const langOptions = Object.entries(languages).map(([value, label]) => ({ value, label }));
  if (f.language && !languages[f.language]) langOptions.push({ value: f.language, label: f.language });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (invalid || !dirty) return;
    update.mutate(
      {
        name: f.name.trim(),
        domain: normalizeDomain(f.domain),
        aliases: f.aliases,
        description: f.description.trim(),
        industry: f.industry.trim(),
        market: f.market.trim(),
        language: f.language,
        engines: f.engines,
        schedule: f.schedule,
      },
      { onSuccess: () => toast.success(PS.saved), onError: (err) => toast.error(copy.app.errors.saveFailed, errorMessage(err)) },
    );
  };
  const err = (k: keyof ReturnType<typeof validate>) => (touched ? errors[k] : null);

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <UnsavedChangesGuard when={dirty} />
      <Card>
        <CardHeader title={PS.sections.brand} />
        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
          <Input label={F.name.label} hint={F.name.help} value={f.name} onChange={(e) => set('name', e.target.value)} error={err('name')} required maxLength={120} />
          <Input
            label={F.domain.label}
            hint={F.domain.help}
            value={f.domain}
            onChange={(e) => set('domain', e.target.value)}
            onBlur={() => set('domain', normalizeDomain(f.domain))}
            error={err('domain')}
            required
            className="font-mono"
            inputMode="url"
            spellCheck={false}
          />
          <ChipsInput label={F.aliases.label} hint={F.aliases.help} placeholder={F.aliases.placeholder} values={f.aliases} onChange={(v) => set('aliases', v)} className="md:col-span-2" />
          <Textarea
            label={F.description.label}
            hint={F.description.help}
            placeholder={F.description.placeholder}
            value={f.description}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            maxLength={2000}
            wrapperClassName="md:col-span-2"
          />
          <Input label={F.industry.label} hint={F.industry.help} placeholder={F.industry.placeholder} value={f.industry} onChange={(e) => set('industry', e.target.value)} maxLength={120} />
          <div className="grid grid-cols-2 gap-4">
            <Input label={F.market.label} placeholder={F.market.placeholder} value={f.market} onChange={(e) => set('market', e.target.value)} error={err('market')} maxLength={40} />
            <Select<string> label={F.language.label} value={f.language} onChange={(v) => set('language', v)} options={langOptions} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={PS.sections.engines} subtitle={PS.enginesHelp} />
        <fieldset className="p-4">
          <legend className="sr-only">{F.engines.label}</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(engines.data ?? ENGINE_IDS.map((id) => ({ id, name: copy.engines[id].name, mode: 'simulated' as const }))).map((e) => {
              const checked = f.engines.includes(e.id);
              return (
                <label
                  key={e.id}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border px-3 py-2.5 transition-colors hover:border-border-strong has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(c) => set('engines', c ? ENGINE_IDS.filter((id) => id === e.id || f.engines.includes(id)) : f.engines.filter((id) => id !== e.id))}
                    aria-label={e.name}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-text">
                      {e.name}
                      <ModeBadge mode={e.mode} engineName={e.name} tooltip={false} />
                    </span>
                    <span className="mt-0.5 block text-xs text-text-subtle">{copy.engines[e.id].note}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {err('engines') && <p className="mt-2 text-xs text-danger">{err('engines')}</p>}
          <Select<Schedule>
            label={F.schedule.label}
            hint={F.schedule.help}
            value={f.schedule}
            onChange={(v) => set('schedule', v)}
            options={SCHEDULES.map((s) => ({ value: s, label: F.schedule.options[s] }))}
            wrapperClassName="mt-4 max-w-xs"
          />
        </fieldset>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-border bg-surface px-4 py-3">
        {dirty && <span className="mr-auto text-[13px] text-text-muted">{PS.unsaved}</span>}
        {touched && invalid && <span className="mr-auto text-[13px] text-danger">{copy.app.errors.validation}</span>}
        <Button variant="ghost" disabled={!dirty || update.isPending} onClick={() => {
            setF(initial);
            setTouched(false);
          }}>
          {PS.discard}
        </Button>
        <Button type="submit" variant="primary" loading={update.isPending} disabled={!dirty}>
          {copy.common.save}
        </Button>
      </div>
    </form>
  );
}

function DangerZone() {
  const { project } = useProject();
  const navigate = useNavigate();
  const remove = useDeleteProject();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const D = copy.pages.projects.deleteDialog;
  return (
    <Card>
      <CardHeader title={PS.sections.danger} subtitle={PS.dangerBody} />
      <div className="flex justify-end p-4 pt-3">
        <Button variant="danger" icon={Trash2} onClick={() => setOpen(true)}>
          {PS.deleteButton}
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={fmt(D.title, { name: project.name })}
        body={D.body}
        confirmLabel={D.confirm}
        cancelLabel={D.cancel}
        confirmText={project.name}
        confirmTextLabel={fmt(PS.typeToConfirm, { name: project.name })}
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(project.id, {
            onSuccess: () => {
              toast.success(fmt(copy.app.toasts.deleted, { name: project.name }));
              navigate('/app', { replace: true });
            },
            onError: (e) => toast.error(fmt(copy.app.errors.deleteFailed, { name: project.name }), errorMessage(e)),
          })
        }
      />
    </Card>
  );
}

export default function ProjectSettingsPage() {
  const { project, projectId } = useProject();
  const I = copy.pages.integrations.sections;
  return (
    <Page className="max-w-5xl">
      <PageHeader
        title={PS.title}
        subtitle={PS.subtitle}
        className="mb-0"
        titleAddon={project.isDemo ? <Badge tone="neutral">{copy.app.badges.demo}</Badge> : undefined}
      />
      <SettingsForm />

      <Card>
        <CardHeader title={PS.sections.competitors} subtitle={PS.competitorsBody} />
        <div className="p-4">
          <CompetitorList />
        </div>
      </Card>

      <Card>
        <CardHeader
          title={PS.sections.tracking}
          subtitle={I.siteKeyBody}
          actions={
            <Link to={`/app/p/${projectId}/integrations`} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              {PS.siteKeyLink}
              <ArrowRight size={12} strokeWidth={2} aria-hidden />
            </Link>
          }
        />
        <div className="p-4">
          <CodeBlock code={project.siteKey} title={I.siteKey} />
        </div>
      </Card>

      <DangerZone />
    </Page>
  );
}
