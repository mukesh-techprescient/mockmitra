import { Link, useParams } from 'react-router-dom';
import { useFetch } from '../../useFetch.js';
import { ErrorBox, Spinner } from '../../components/ui.jsx';
import { QuestionReview } from '../Review.jsx';
import { AdminNav } from './AdminHome.jsx';

export default function TestPreview() {
  const { id } = useParams();
  const { data, error, loading } = useFetch(`/admin/tests/${id}`);
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const t = data.test;
  const secName = Object.fromEntries(t.sections.map((s) => [s.id, s.name]));
  return (
    <>
      <div className="page-head"><h1>{t.title}</h1><AdminNav /></div>
      <p className="muted">
        {t.category?.name} · {t.questionCount} questions · {t.durationMinutes} min · {t.published ? 'Published' : 'Draft'} ·{' '}
        <Link to={`/admin/upload/${t._id}`}>Replace JSON</Link>
      </p>
      {t.questions.map((q, i) => <QuestionReview key={q.qid} q={q} n={i + 1} sectionName={secName[q.section]} />)}
    </>
  );
}
