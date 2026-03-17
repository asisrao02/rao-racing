function Panel({ children, className = "" }) {
  return <section className={`glass rounded-2xl p-5 ${className}`}>{children}</section>;
}

export default Panel;
