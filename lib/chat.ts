import source from "./event-data.json";
export type ChatMessage = {id:string;displayName:string;body:string;createdAt:number;isOwn:boolean};
export const CHAT_LIMITS={message:1500,reason:300,bodyBytes:8192,pollMs:5000,maxPerMinute:6,minIntervalMs:2000,maxPerDay:300} as const;
export const CHAT_ROOMS=source.conferences.map(c=>({id:c.id,name:c.name,timeZone:c.timeZone}));
export function chatRoom(id:unknown){if(typeof id!=="string"||!CHAT_ROOMS.some(c=>c.id===id))throw new Error("Choose one of the supported conference rooms.");return id;}
export function chatText(value:unknown,max:number=CHAT_LIMITS.message,required=true){if(typeof value!=="string"||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw new Error(`Use plain text, up to ${max} characters.`);const text=value.trim();if(required&&!text)throw new Error("Write a message first.");return text;}
export function chatId(value:unknown){if(typeof value!=="string"||!/^[-a-zA-Z0-9]{1,80}$/.test(value))throw new Error("Invalid message.");return value;}
