// frontend/components/Square.jsx
export default function Square({ children, className, onClick }) {
  return (
    <div className={className} onClick={onClick}>
      {children}
    </div>
  );
}
