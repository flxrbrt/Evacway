import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faXmark, faSpinner, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { api } from '../../services/api';
import './NonRegisteredEvacuees.css';

const emptyPerson = () => ({ first_name: '', middle_name: '', last_name: '', sex: '', age_years: '',
  birthdate: '', contact_number: '', address: '', is_pwd: false, is_pregnant: false, needs_medical: false, notes: '' });
const formatTime = (value) => value ? new Date(value).toLocaleString() : '—';

export function AddNonRegisteredButton({ disabled, onClick }) {
  return <button type="button" className="nre-add-button" onClick={onClick} disabled={disabled}
    title={disabled ? 'Select an operation first' : 'Record people arriving without an assignment'}>
    <FontAwesomeIcon icon={faPlus} aria-hidden="true" /> Add non-registered
  </button>;
}

function PersonFields({ person, index, update, remove, operationId, fields, prefix, compact }) {
  const [matches, setMatches] = useState([]);
  const [duplicateError, setDuplicateError] = useState('');
  const query = [person.first_name, person.last_name].filter(Boolean).join(' ').trim();
  useEffect(() => {
    if (query.length < 2 || !operationId) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      api.findNonRegisteredDuplicates(query, operationId).then((result) => {
        if (active) { setMatches(result.matches || []); setDuplicateError(''); }
      }).catch(() => { if (active) { setMatches([]); setDuplicateError('Duplicate suggestions unavailable. You can still save.'); } });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [query, operationId]);
  const field = (name, label, type = 'text', required = false) => {
    const error = fields[`${prefix}${name}`];
    const id = `nre-person-${index}-${name}`;
    return <label className="nre-field" htmlFor={id} key={name}>
      <span>{label}{required ? ' *' : ''}</span>
      <input id={id} type={type} value={person[name] ?? ''} required={required}
        min={type === 'number' ? 0 : undefined} max={type === 'number' ? 120 : type === 'date' ? new Date().toLocaleDateString('en-CA') : undefined}
        step={type === 'number' ? 1 : undefined} maxLength={name.includes('name') ? 60 : type === 'text' ? 200 : undefined}
        autoComplete="off" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => update(name, event.target.value)} />
      {error && <span className="nre-field-error" id={`${id}-error`}>{error}</span>}
    </label>;
  };
  return <fieldset className={`nre-person ${compact ? 'is-compact' : ''}`}>
    <legend>{compact ? `Family member ${index + 1}` : index === 0 ? 'Head of group' : 'Person details'}</legend>
    {remove && <button type="button" className="nre-remove" onClick={remove} aria-label={`Remove family member ${index + 1}`}><FontAwesomeIcon icon={faXmark} /></button>}
    <div className="nre-name-grid">
      {field('first_name', 'First name', 'text', true)}
      {field('middle_name', 'Middle name')}
      {field('last_name', 'Last name', 'text', true)}
    </div>
    {query.length >= 2 && (matches.length > 0 || duplicateError) && <div className="nre-duplicates" role="status">
      {duplicateError || 'Possible existing records — review before saving. This does not prevent an arrival.'}
      {matches.map((match) => <div key={`${match.source}-${match.id}`}>
        <span>{match.name} · {match.source === 'resident' ? 'Registered resident' : 'Non-registered arrival'}</span>
        {match.source === 'resident' && <button type="button" onClick={() => {
          for (const key of ['first_name', 'middle_name', 'last_name', 'sex', 'age_years', 'birthdate']) {
            if (match[key] !== null && match[key] !== undefined) update(key, match[key]);
          }
        }}>Use this record</button>}
      </div>)}
    </div>}
    <div className="nre-demographic-grid">
      <label className="nre-field" htmlFor={`nre-sex-${index}`}><span>Sex *</span>
        <select id={`nre-sex-${index}`} required value={person.sex} aria-invalid={Boolean(fields[`${prefix}sex`])}
          onChange={(event) => { update('sex', event.target.value); if (event.target.value !== 'female') update('is_pregnant', false); }}>
          <option value="">Select sex</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
        </select>{fields[`${prefix}sex`] && <span className="nre-field-error">{fields[`${prefix}sex`]}</span>}
      </label>
      {field('age_years', 'Age in years', 'number', true)}
      {!compact && field('birthdate', 'Birthdate (optional)', 'date')}
    </div>
    <div className="nre-needs">
      {[['is_pwd', 'PWD'], ['is_pregnant', 'Pregnant'], ['needs_medical', 'Needs medical attention']].map(([key, label]) => <label key={key}>
        <input type="checkbox" checked={Boolean(person[key])} disabled={key === 'is_pregnant' && person.sex !== 'female'} onChange={(event) => update(key, event.target.checked)} />{label}
        {fields[`${prefix}${key}`] && <span className="nre-field-error">{fields[`${prefix}${key}`]}</span>}
      </label>)}
    </div>
    {compact ? <details className="nre-optional-details"><summary>Optional contact, address and birthdate</summary><div className="nre-detail-grid">{field('birthdate', 'Birthdate (optional)', 'date')}{field('contact_number', 'Contact number (optional)', 'tel')}{field('address', 'Address / place of origin')}{field('notes', 'Notes (optional)')}</div></details>
      : <div className="nre-detail-grid">{field('contact_number', 'Contact number (optional)', 'tel')}{field('address', 'Address / place of origin')}{field('notes', 'Notes (optional)')}</div>}
  </fieldset>;
}

export function NonRegisteredModal({ mode, centers, operation, centerId, onClose, onSaved }) {
  const [people, setPeople] = useState(() => [{ ...emptyPerson(), ...(mode.person || {}) }]);
  const [shelter, setShelter] = useState(() => String(mode.group?.center_id || (centerId !== 'all' ? centerId : '')));
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const modal = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal.current?.querySelector('select:not(:disabled), input:not(:disabled), button')?.focus();
    const keydown = (event) => {
      if (event.key === 'Escape' && !lock.current) onCloseRef.current();
      if (event.key === 'Tab') {
        const nodes = [...modal.current.querySelectorAll('input:not(:disabled),select:not(:disabled),button:not(:disabled)')];
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const update = (index, key, value) => setPeople((current) => current.map((person, i) => i === index ? { ...person, [key]: value } : person));
  const submit = async (event) => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setSaving(true); setError(''); setFields({});
    const normalized = people.map((person) => Object.fromEntries(Object.keys(emptyPerson()).map((key) => [key, key === 'age_years' ? Number(person[key]) : person[key]])));
    try {
      if (mode.kind === 'edit') await api.updateNonRegisteredPerson(mode.person.id, normalized[0]);
      else if (mode.kind === 'member') await api.addNonRegisteredMember(mode.group.group_code, normalized[0]);
      else await api.createNonRegisteredGroup({ center_id: Number(shelter), operation_id: operation.id, people: normalized });
      await onSaved();
      onClose();
    } catch (requestError) { setError(requestError.message || 'Could not save arrivals.'); setFields(requestError.data?.fields || {}); }
    finally { lock.current = false; setSaving(false); }
  };
  return <div className="nre-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="nre-modal" ref={modal} role="dialog" aria-modal="true" aria-labelledby="nre-modal-title">
      <header><div><h2 id="nre-modal-title">{mode.kind === 'edit' ? 'Edit arrival details' : mode.kind === 'member' ? 'Add family member' : 'Add non-registered arrivals'}</h2>
        <p>{mode.kind === 'create' ? `${people.length} ${people.length === 1 ? 'person' : 'people'}` : mode.group?.head_name}</p></div>
        <button type="button" onClick={onClose} disabled={saving} aria-label="Close arrival form"><FontAwesomeIcon icon={faXmark} /></button>
      </header>
      <form onSubmit={submit}>
        <div className="nre-modal-body">
          <div className="nre-detail-grid">
            <label className="nre-field" htmlFor="nre-shelter"><span>Shelter *</span><select id="nre-shelter" required value={shelter} disabled={mode.kind !== 'create'} onChange={(event) => setShelter(event.target.value)}>
              <option value="">Select shelter</option>{centers.map((center) => <option key={center.id} value={center.id}>{center.name}</option>)}
            </select>{fields.center_id && <span className="nre-field-error">{fields.center_id}</span>}</label>
            <label className="nre-field"><span>Operation</span><input value={operation?.event_name || ''} readOnly aria-label="Active operation" />
              {fields.operation_id && <span className="nre-field-error">{fields.operation_id}</span>}</label>
          </div>
          {people.map((person, index) => <PersonFields key={index} person={person} index={index} operationId={operation?.id}
            update={(key, value) => update(index, key, value)} compact={index > 0} fields={fields} prefix={mode.kind === 'create' ? `people.${index}.` : ''}
            remove={index > 0 ? () => setPeople((current) => current.filter((_, i) => i !== index)) : null} />)}
          {mode.kind === 'create' && <button type="button" className="nre-secondary" disabled={people.length >= 30 || saving} onClick={() => setPeople((current) => [...current, emptyPerson()])}><FontAwesomeIcon icon={faPlus} /> Add family member</button>}
          {fields.people && <p className="nre-field-error">{fields.people}</p>}
          <p className="nre-privacy">Information is used only for evacuation management (Data Privacy Act, RA 10173).</p>
          {error && <p className="nre-field-error" role="alert">{error}</p>}
        </div>
        <footer><button type="button" className="nre-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="nre-add-button" disabled={saving}>{saving && <FontAwesomeIcon icon={faSpinner} spin />}{saving ? 'Saving arrivals...' : 'Save arrivals'}</button></footer>
      </form>
    </section>
  </div>;
}

export function NonRegisteredGroups({ result, loading, error, retry, status, setStatus, page, setPage, canEdit, isAdmin, onEdit, onMember, onChanged, onAdd, addDisabled }) {
  const [expanded, setExpanded] = useState(new Set());
  const [details, setDetails] = useState({});
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState('');
  const groups = result?.groups || [];
  const act = async (key, task) => {
    if (busy) return;
    setBusy(key); setActionError('');
    try { await task(); setDetails({}); await onChanged(); }
    catch (requestError) { setActionError(requestError.message || 'The arrival could not be updated.'); }
    finally { setBusy(null); }
  };
  const reveal = async (group, editPerson = null) => {
    if (busy) return;
    setBusy(group.group_code); setActionError('');
    try {
      const response = await api.getNonRegisteredGroup(group.group_code, true);
      setDetails((current) => ({ ...current, [group.group_code]: response.group }));
      if (editPerson) onEdit(response.group.members.find((person) => person.id === editPerson.id), group);
    } catch (requestError) { setActionError(requestError.message || 'Could not load protected details.'); }
    finally { setBusy(null); }
  };
  return <section className="nre-groups" aria-labelledby="nre-groups-title">
    <div className="nre-section-heading"><h2 id="nre-groups-title">Non-registered arrivals</h2><label>Status <select aria-label="Non-registered status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">All</option><option value="present">On-site</option><option value="departed">Departed</option></select></label></div>
    {actionError && <p className="nre-field-error" role="alert">{actionError}</p>}
    {loading ? <p role="status">Loading non-registered arrivals...</p> : error ? <div role="alert"><p>{error.message}</p><button type="button" className="nre-secondary" onClick={retry}>Retry</button></div>
      : groups.length === 0 ? <div className="nre-empty"><h3>No non-registered arrivals</h3><p>Record people who arrive without a pre-assignment.</p><AddNonRegisteredButton disabled={addDisabled} onClick={onAdd} /></div>
        : <><div className="nre-table-wrap"><table className="nre-table"><thead><tr><th>Head of group</th><th>People</th><th>Shelter</th><th>Arrival</th><th>Status</th><th>Staff action</th></tr></thead>
          <tbody>{groups.map((group) => {
            const open = expanded.has(group.group_code);
            const members = details[group.group_code]?.members || group.members;
            return <GroupRows key={group.group_code} {...{ group, open, members, busy, canEdit, isAdmin }}
              toggle={() => setExpanded((current) => { const next = new Set(current); if (next.has(group.group_code)) next.delete(group.group_code); else next.add(group.group_code); return next; })}
              reveal={() => reveal(group)} edit={(person) => reveal(group, person)} member={() => onMember(group)}
              depart={(person, departed) => act(`departure-${person?.id || group.group_code}`, () => api.departNonRegistered(person?.id || group.group_code, departed, !person))}
              remove={(person) => { if (window.confirm('Delete this non-registered arrival record?')) act(`delete-${person.id}`, () => api.deleteNonRegisteredPerson(person.id)); }} />;
          })}</tbody></table></div>
          <nav className="nre-pagination" aria-label="Non-registered groups pagination"><span>{result.total} groups</span><button type="button" className="nre-secondary" disabled={page <= 1 || busy} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button type="button" className="nre-secondary" disabled={page * 10 >= result.total || busy} onClick={() => setPage(page + 1)}>Next</button></nav></>}
  </section>;
}

function GroupRows({ group, open, members, busy, canEdit, isAdmin, toggle, reveal, edit, member, depart, remove }) {
  return <><tr><td><button className="nre-group-toggle" type="button" aria-expanded={open} onClick={toggle}><FontAwesomeIcon icon={faChevronDown} />{group.head_name}</button></td>
    <td>{group.people_count} people<br /><small>{group.present_count} on-site</small></td><td>{group.center_name}</td><td>{formatTime(group.arrived_at)}</td>
    <td><span className="nre-pill">Non-registered</span><span className={`nre-pill ${group.present_count ? 'is-arrived' : ''}`}>{group.present_count ? 'Arrived' : 'Departed'}</span></td>
    <td>{canEdit && <div className="nre-actions"><button type="button" disabled={Boolean(busy)} onClick={() => depart(null, group.present_count > 0)}>{group.present_count ? 'Depart group' : 'Undo departure'}</button>{group.present_count > 0 && group.present_count < group.people_count && <button type="button" disabled={Boolean(busy)} onClick={() => depart(null, false)}>Undo group departure</button>}<button type="button" disabled={Boolean(busy)} onClick={member}>Add member</button></div>}</td></tr>
    {open && <tr><td colSpan={6}><div className="nre-member-list"><button type="button" className="nre-secondary" disabled={Boolean(busy)} onClick={reveal}>View contact numbers and medical needs</button>
      {members.map((person) => <article key={person.id}><div><strong>{person.name}{person.is_group_head ? ' · Head' : ''}</strong><p>{person.sex} · {person.age_years} years · {person.departed_at ? `Departed ${formatTime(person.departed_at)}` : 'On-site'}</p>
        {person.address && <p>{person.address}</p>}{Object.hasOwn(person, 'contact_number') && <p>Contact: {person.contact_number || 'Not provided'} · Needs: {[person.is_pwd && 'PWD', person.is_pregnant && 'Pregnant', person.needs_medical && 'Medical attention'].filter(Boolean).join(', ') || 'None recorded'}{person.notes ? ` · ${person.notes}` : ''}</p>}</div>
        <div className="nre-actions">{canEdit && <><button type="button" disabled={Boolean(busy)} onClick={() => edit(person)}>Edit</button><button type="button" disabled={Boolean(busy)} onClick={() => depart(person, !person.departed_at)}>{person.departed_at ? 'Undo departure' : 'Departed'}</button></>}{isAdmin && <button type="button" disabled={Boolean(busy)} onClick={() => remove(person)}>Delete</button>}</div>
      </article>)}
    </div></td></tr>}
  </>;
}
