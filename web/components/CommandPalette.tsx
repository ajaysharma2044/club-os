"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowSquareOut, User, Gear } from "@phosphor-icons/react";
import { Modal } from "./cec/FormPrimitives";
import {useCEC} from "./cec/Connection";
import {memberNavigation, managementNavigation} from "@/lib/cec/navigation";

export function CommandPalette() {
  const router = useRouter();
  const {data} = useCEC();
  const [open, setOpen] = useState(false), [q, setQ] = useState(""), [active, setActive] = useState(0);
  const items = useMemo(() => {
    const all = [
      ...[...memberNavigation,
        {href:"/clubs/cec/info",label:"Club info & resources"},
        {href:"/clubs/cec/requests",label:"Requests"},
        {href:"/clubs/cec/record",label:"Club activity"},
        {href:"/clubs/cec/schedule",label:"Calendar"},
        {href:"/clubs/cec/directory",label:"Shared projects"},
        {href:"/discover",label:"Explore clubs"},
      ].map(i=>({...i,group:"Pages"})),
      ...(data?.user ? [
        {href:"/clubs/cec/profile",label:"My club profile"},
        {href:"/you",label:"Account settings"},
        {href:"/clubs/cec/intake",label:"Share a weekly update"},
      ] : [{href:"/you",label:"Sign in"}]).map(i=>({...i,group:"My account"})),
      ...(data?.user?.role === "officer" ? managementNavigation.filter(i=>!["/clubs/cec/info","/clubs/cec/requests","/clubs/cec/people"].includes(i.href)).map(i=>({...i,group:"Officer tools"})) : []),
    ];
    const needle = q.trim().toLowerCase();
    return all.filter(i=>`${i.label} ${i.group}`.toLowerCase().includes(needle));
  }, [q,data?.user?.id,data?.user?.role]);
  useEffect(()=>{
    const show=()=>{setOpen(true);setQ("");setActive(0);};
    const key=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();if(document.querySelector('[role="dialog"]:not(.command-dialog)'))return;setOpen(v=>!v);setQ("");setActive(0);}};
    window.addEventListener("keydown",key);window.addEventListener("clubos:command",show);
    return()=>{window.removeEventListener("keydown",key);window.removeEventListener("clubos:command",show);};
  },[]);
  useEffect(()=>{setActive(0);},[q,data?.user?.id,data?.user?.role]);
  useEffect(()=>{if(open)document.getElementById(`jump-result-${active}`)?.scrollIntoView({block:"nearest"});},[active,open]);
  if(!open)return null;
  const go=(href:string)=>{setOpen(false);router.push(href);};
  return <Modal title="Jump to a page" variant="command" close={()=>setOpen(false)}>
    <div className="command-search">
      <input role="combobox" aria-label="Jump to a page" aria-expanded="true" aria-controls="jump-results" aria-autocomplete="list" aria-activedescendant={items[active]?`jump-result-${active}`:undefined} placeholder="Jump to…" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{
        if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setActive(i=>Math.max(0,Math.min(items.length-1,i+(e.key==="ArrowDown"?1:-1))));}
        if(e.key==="Enter"&&items[active]){e.preventDefault();go(items[active].href);}
      }}/>
    </div>
    <div className="command-results" id="jump-results" role="listbox" aria-label="Pages">
      {items.map((item,i)=>{const Icon=item.group==="Officer tools"?Gear:item.group==="My account"?User:ArrowSquareOut;return <Fragment key={item.href}>
        {(i===0||items[i-1].group!==item.group)&&<div className="command-group" role="presentation">{item.group}</div>}
        <div role="option" aria-selected={i===active} id={`jump-result-${i}`} className="command-option" onMouseEnter={()=>setActive(i)} onClick={()=>go(item.href)}><Icon size={18} aria-hidden/><span>{item.label}</span></div>
      </Fragment>;})}
    </div>
    {!items.length&&<p className="command-empty" role="status">No matching pages. Try “events” or “profile”.</p>}
    <footer className="command-hints">↑↓ move <span>Enter open</span><span>Esc close</span></footer>
  </Modal>;
}
