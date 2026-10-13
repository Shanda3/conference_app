'use strict';
if(/^#(?:group-invite|shared-plan)=[A-Za-z0-9_-]{43}$/.test(location.hash))location.replace('https://thunderplains.devyo.app/'+location.hash);
const setupForm=document.getElementById('setup-form');
function clearSetupReview(){document.getElementById('setup-review').hidden=true;document.getElementById('setup-email').removeAttribute('href');document.getElementById('setup-summary').textContent='';}
setupForm.addEventListener('input',clearSetupReview);
setupForm.addEventListener('submit',event=>{
 event.preventDefault();const error=document.getElementById('setup-error');error.textContent='';clearSetupReview();
 try{
  const name=document.getElementById('conference-name').value.trim(),raw=document.getElementById('conference-url').value.trim(),contact=document.getElementById('communication-email').value.trim(),requester=document.getElementById('requester-name').value.trim(),url=new URL(raw);
  if(!name||name.length>160||/[\u0000-\u001f\u007f]/.test(name)||url.protocol!=='https:'||url.username||url.password||url.port||url.hash||url.search||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(url.hostname)||!url.hostname.includes('.')||url.hostname.includes(':'))throw Error('Enter a conference name and its public HTTPS website. Use a website address without passwords, query parameters or fragments.');
  if(!requester||requester.length>160||/[\u0000-\u001f\u007f]/.test(requester))throw Error('Enter the requester name for your setup request.');
  if(contact.length>254||! /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(contact)||/[\u0000-\u001f\u007f]/.test(contact))throw Error('Enter a valid communication email for your setup request.');
  const body='Hello Devyo,\n\nI would like to set up '+name+' on Devyo.\nOfficial event website: '+url.href+'\nRequester name: '+requester+'\nCommunication email: '+contact+'\nThis contact address has not been verified by this temporary form.\n\nMy organizer role:\nEvent dates and timezone:\nPreferred conference name in the URL:\nProgram source or public schedule:\n\nPlease review this request before importing or publishing.\n';
  document.getElementById('setup-summary').textContent=name+' — '+url.href+' · Private requester: '+requester+' · Communication email: '+contact;
  document.getElementById('setup-email').href='mailto:shandaokcwebdev@gmail.com?subject='+encodeURIComponent('Devyo conference setup request: '+name)+'&body='+encodeURIComponent(body.replace(/\r?\n/g,'\r\n'));
  const review=document.getElementById('setup-review');review.hidden=false;review.focus();review.scrollIntoView({block:'nearest'});
 }catch(e){error.textContent=e.message;}
});
