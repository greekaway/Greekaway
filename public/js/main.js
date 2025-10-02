function openOverlay(id){
  document.querySelectorAll('.overlay').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(id);
  if(el) el.classList.add('active');
}

function closeOverlay(id){
  const el = document.getElementById(id);
  if(el) el.classList.remove('active');
}
