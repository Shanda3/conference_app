import {PLANNER_LIMITS} from './planner.ts';
import {INNOTECH_EVENT,OFFICIAL_SESSION_FIELDS} from './program-reconcile.ts';
import {toPlannerSession,type PublishedSession} from './program-model.ts';
const literal=(value:string)=>"'"+value.replace(/'/g,"''")+"'";
/** A narrow, atomic metadata repair. Private planner JSON never leaves D1. */
export function innoTechBackfillSQL(published:readonly PublishedSession[],mode:'preview'|'apply',expectedProgramHash?:string){
 const sessions=published.filter(s=>s.conferenceId===INNOTECH_EVENT);
 if(!sessions.length||sessions.length>100||sessions.some(s=>!/^\d+$/.test(s.sourceId)||!(s.id===INNOTECH_EVENT+'-whova-'+s.sourceId||s.sourceId==='5479357'&&s.id===INNOTECH_EVENT+'-happy-45-minute-reception')))throw Error('Invalid public InnoTech update');
 const publicJSON=literal(JSON.stringify(sessions.map(toPlannerSession))),paths=OFFICIAL_SESSION_FIELDS.map(f=>literal('$.'+f)).join(','),setters=OFFICIAL_SESSION_FIELDS.map(f=>literal('$.'+f)+",json_extract(o.value,"+literal('$.'+f)+")").join(',');
 const guard=expectedProgramHash?` AND EXISTS(SELECT 1 FROM public_program_sources WHERE conference_id='${INNOTECH_EVENT}' AND hash=${literal(expectedProgramHash)})`:"";
 const cte=`WITH official AS MATERIALIZED (SELECT key,value FROM json_each(${publicJSON})),eligible AS MATERIALIZED (
 SELECT owner_id,revision,state_json AS before_json FROM planner_states
 WHERE json_valid(state_json) AND json_extract(state_json,'$.initialized')=1
 AND json_type(state_json,'$.sessions')='array' AND json_array_length(state_json,'$.sessions')<=${PLANNER_LIMITS.sessions}
 AND EXISTS(SELECT 1 FROM json_each(state_json,'$.conferences') WHERE json_extract(value,'$.id')='${INNOTECH_EVENT}')
 AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE owner_id=planner_states.owner_id)${guard}
 ),proposed AS MATERIALIZED (SELECT owner_id,revision,before_json,json_set(before_json,'$.sessions',json((
 SELECT json_group_array(json(patched)) FROM (
 SELECT CASE WHEN o.value IS NOT NULL THEN json_set(s.value,${setters}) ELSE s.value END AS patched,CAST(s.key AS INTEGER) AS position
 FROM json_each(eligible.before_json,'$.sessions') s LEFT JOIN official o ON json_extract(o.value,'$.id')=json_extract(s.value,'$.id') AND json_extract(s.value,'$.conferenceId')='${INNOTECH_EVENT}'
 UNION ALL SELECT value AS patched,1000000+CAST(key AS INTEGER) AS position FROM (
 SELECT o.key,o.value,ROW_NUMBER() OVER(ORDER BY CAST(o.key AS INTEGER)) AS missing_position FROM official o
 WHERE NOT EXISTS(SELECT 1 FROM json_each(eligible.before_json,'$.sessions') s WHERE json_extract(s.value,'$.id')=json_extract(o.value,'$.id'))
 ) WHERE missing_position<=${PLANNER_LIMITS.sessions}-json_array_length(eligible.before_json,'$.sessions')
 ORDER BY position
 )))) AS after_json FROM eligible),checked AS MATERIALIZED (SELECT *,
 json_remove(before_json,'$.sessions')=json_remove(after_json,'$.sessions') AND NOT EXISTS(
 SELECT 1 FROM json_each(before_json,'$.sessions') b LEFT JOIN json_each(after_json,'$.sessions') a ON a.key=b.key
 WHERE a.value IS NULL OR json_remove(b.value,${paths})<>json_remove(a.value,${paths})
 OR (json_extract(b.value,'$.conferenceId')<>'${INNOTECH_EVENT}' OR NOT EXISTS(SELECT 1 FROM official o WHERE json_extract(o.value,'$.id')=json_extract(b.value,'$.id'))) AND json(b.value)<>json(a.value)
 ) AS private_fields_preserved FROM proposed)
 `;
 if(mode==='apply')return cte+"UPDATE planner_states SET state_json=(SELECT after_json FROM checked WHERE checked.owner_id=planner_states.owner_id),revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE owner_id IN(SELECT owner_id FROM checked WHERE private_fields_preserved AND json(before_json)<>json(after_json));";
 return cte+`SELECT COUNT(*) AS eligible_plans,COALESCE(SUM(json(before_json)<>json(after_json)),0) AS plans_to_change,COALESCE(SUM(NOT private_fields_preserved),0) AS preservation_violations,
 COALESCE(SUM(json_array_length(after_json,'$.sessions')-json_array_length(before_json,'$.sessions')),0) AS sessions_to_add,
 COALESCE(SUM((SELECT COUNT(*) FROM json_each(before_json,'$.sessions') b JOIN json_each(after_json,'$.sessions') a ON a.key=b.key WHERE json_extract(b.value,'$.start')<>json_extract(a.value,'$.start') OR json_extract(b.value,'$.end')<>json_extract(a.value,'$.end'))),0) AS session_times_to_correct FROM checked;`;
}
