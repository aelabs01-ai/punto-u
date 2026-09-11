import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const projectDir = dirname(fileURLToPath(import.meta.url));

try{
  const envFile = await readFile(join(projectDir,'.env'),'utf8');
  envFile.split(/\r?\n/).forEach(line=>{
    const clean = line.trim();
    if(!clean || clean.startsWith('#') || !clean.includes('=')) return;
    const separator = clean.indexOf('=');
    const key = clean.slice(0,separator).trim();
    const value = clean.slice(separator+1).trim().replace(/^(['"])(.*)\1$/,'$2');
    if(key && process.env[key] === undefined) process.env[key] = value;
  });
}catch(error){
  if(error.code !== 'ENOENT') throw error;
}

const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || 'gpt-5.2';

function sendJson(response,status,payload){
  response.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});
  response.end(JSON.stringify(payload));
}

async function readJson(request){
  let body = '';
  for await (const chunk of request){
    body += chunk;
    if(body.length > 20_000) throw new Error('El mensaje supera el tamaño permitido.');
  }
  return JSON.parse(body || '{}');
}

function cleanTrip(trip = {}){
  const text = value => String(value || '').slice(0,160);
  return {
    estado:text(trip.status),
    servicio:text(trip.service),
    origen:text(trip.origin),
    destino:text(trip.destination),
    minutosEstimados:Number.isFinite(trip.estimatedMinutes) ? trip.estimatedMinutes : null,
    conductor:{
      nombre:text(trip.driver?.name),
      calificacion:Number(trip.driver?.rating) || null,
      vehiculo:text(trip.driver?.vehicle),
      color:text(trip.driver?.color),
      placa:text(trip.driver?.plate)
    }
  };
}

function extractResponseText(data){
  if(typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  return (data.output || [])
    .flatMap(item=>item.content || [])
    .filter(content=>content.type === 'output_text' && typeof content.text === 'string')
    .map(content=>content.text)
    .join('\n')
    .trim();
}

async function answerWithAI({message,history,trip}){
  if(!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no está configurada.');

  const safeHistory = Array.isArray(history) ? history.slice(-8).map(item=>({
    role:item?.role === 'assistant' ? 'assistant' : 'user',
    content:String(item?.content || '').slice(0,500)
  })).filter(item=>item.content) : [];

  const tripData = cleanTrip(trip);
  const apiResponse = await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{
      'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({
      model,
      store:false,
      max_output_tokens:180,
      instructions:`Eres el asistente automático de viaje de Punto U, una app colombiana de movilidad universitaria. Responde siempre en español claro, amable y práctico, en máximo tres oraciones breves. Solo atiende dudas del viaje actual: llegada, ubicación, conductor, vehículo, placa, recogida, destino, seguridad, cancelación y cobro. Usa únicamente los datos del contexto; jamás inventes ubicaciones, tiempos, políticas, cobros o acciones realizadas. Si falta un dato, dilo con claridad y dirige al usuario a la pantalla del viaje o al soporte. No suplantes al conductor: identifícate como asistente automático cuando sea relevante. Ante una emergencia, indica que contacte directamente a los servicios de emergencia. Contexto del viaje: ${JSON.stringify(tripData)}`,
      input:[...safeHistory,{role:'user',content:String(message).slice(0,500)}]
    })
  });

  const data = await apiResponse.json();
  if(!apiResponse.ok){
    const detail = data?.error?.message || 'No se pudo obtener una respuesta de IA.';
    throw new Error(detail);
  }
  const reply = extractResponseText(data);
  if(!reply) throw new Error('La IA devolvió una respuesta vacía.');
  return reply;
}

const server = createServer(async (request,response)=>{
  try{
    const url = new URL(request.url,'http://localhost');
    if(request.method === 'POST' && url.pathname === '/api/chat'){
      const body = await readJson(request);
      const message = String(body.message || '').trim();
      if(!message) return sendJson(response,400,{error:'Escribe un mensaje.'});
      const reply = await answerWithAI({...body,message});
      return sendJson(response,200,{reply});
    }

    if(request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')){
      const html = await readFile(join(projectDir,'index.html'));
      response.writeHead(200,{
        'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'no-store'
      });
      return response.end(html);
    }

    return sendJson(response,404,{error:'Ruta no encontrada.'});
  }catch(error){
    console.error(error);
    return sendJson(response,500,{error:'El asistente no está disponible en este momento.'});
  }
});

server.listen(port,()=>{
  console.log(`Punto U disponible en http://localhost:${port}`);
  if(!process.env.OPENAI_API_KEY){
    console.log('OPENAI_API_KEY no configurada: el navegador usará respuestas locales del viaje.');
  }
});
